const STYLE_MAP = {
  Text: [
    'fontSize',
    'color',
    'textAlign',
    'overflow',
    'fontWeight',
    'decoration',
    'decorationColor',
    'decorationStyle'
  ],
  Image: ['width', 'height', 'image', 'fit'],
  Container: [
    'margin',
    'width',
    'height',
    'alignment',
    'padding',
    'transform',
    'color',
    'decoration'
  ],
  Row: ['crossAxisAlignment', 'mainAxisAlignment'],
  Column: ['crossAxisAlignment', 'mainAxisAlignment'],
  ListView: ['padding', 'shrinkWrap'],
  Expanded: ['flex'],
  Padding: [],
  Stack: [],
  Positioned: ['top', 'left', 'bottom', 'right', 'width', 'height']
};

const isExpression = value => {
  return /^\{\{.*\}\}$/.test(value);
};

const formatProps = value => {
  return Object.keys(value)
    .map(key => `${key}: ${value[key]}`)
    .join(',\n');
};

const hashToRgb = hash => {
  const _hash = hash.substr(1);
  const R = _hash.substring(0, 2);
  const G = _hash.substring(2, 4);
  const B = _hash.substring(4);
  return `Color.fromARGB(255, ${parseInt('0x' + R)}, ${parseInt(
    '0x' + G
  )}, ${parseInt('0x' + B)})`;
};

const transformUnit = unit => {
  return (parseInt(unit) / 2).toFixed(2);
};

module.exports = function(schema, option) {
  const {prettier} = option;
  // Global Public Functions
  const utils = [];

  // Global Widget List
  const widgets = [];

  // Classes
  const classes = [];

  const toString = value => {
    if ({}.toString.call(value) === '[object Function]') {
      return value.toString();
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, (key, value) => {
        if (typeof value === 'function') {
          return value.toString();
        } else {
          return value;
        }
      });
    }

    return String(value);
  };

  const baseWidget = (componentName, widgetName) => {
    let _content = '';
    return {
      setBuild: function(content) {
        _content = content;
      },
      build: function() {
        return `class ${componentName} extends ${widgetName} {
          @override
          Widget build(BuildContext context) {
            return ${_content};
          }
        }`;
      }
    };
  };

  const statefulWidget = (componentName, content) => {
    const _statefulWidget = baseWidget(
      `_${componentName}`,
      `State<${componentName}>`
    );
    _statefulWidget.setBuild(content);
    const _stateWidget = _statefulWidget.build();
    const _statefulWrapper = `class ${componentName} extends StatefulWidget {\
      ${componentName}({Key key, this.title}) : super(key: key);
      final String title;
      @override
      _${componentName} createState() => _${componentName}();\
    }${_stateWidget}`;
    return _statefulWrapper;
  };

  const statelessWidget = (componentName, content) => {
    const _statelessWidget = baseWidget(componentName, 'StatelessWidget');
    _statelessWidget.setBuild(content);
    return _statelessWidget.build();
  };

  // convert to responsive unit, such as vw
  const parseStyle = style => {
    const mapStyle = {};

    const flutterMargin = [0.0, 0.0, 0.0, 0.0]; // LTRB
    const flutterPadding = [0.0, 0.0, 0.0, 0.0]; // LTRB

    for (let key in style) {
      const val = transformUnit(style[key]);
      switch (key) {
        case 'fontSize':
          mapStyle['fontSize'] = val;
          break;
        case 'color':
          mapStyle['color'] = hashToRgb(style[key]);
          break;
        case 'backgroundColor':
          mapStyle['backgroundColor'] = hashToRgb(style[key]);
          break;
        case 'borderRadius':
          mapStyle['borderRadius'] = `BorderRadius.circular(${val})`;
          break;
        case 'marginLeft':
          flutterMargin[0] = val;
          break;
        case 'marginTop':
          flutterMargin[1] = val;
          break;
        case 'marginRight':
          flutterMargin[2] = val;
          break;
        case 'marginBottom':
          flutterMargin[3] = val;
          break;
        case 'paddingLeft':
          flutterPadding[0] = val;
          break;
        case 'paddingTop':
          flutterPadding[1] = val;
          break;
        case 'paddingRight':
          flutterPadding[2] = val;
          break;
        case 'paddingBottom':
          flutterPadding[3] = val;
          break;
        case 'height':
        case 'width':
        case 'maxWidth':
        case 'lineHeight':
        case 'top':
        case 'bottom':
        case 'right':
        case 'left':
          mapStyle[key] = val;
          break;
      }
    }
    if (flutterMargin.some(val => val > 0)) {
      mapStyle['margin'] = `const EdgeInsets.fromLTRB(${flutterMargin.join(
        ','
      )})`;
    }
    if (flutterPadding.some(val => val > 0)) {
      mapStyle['padding'] = `const EdgeInsets.fromLTRB(${flutterPadding.join(
        ','
      )})`;
    }

    // 如果宽度是满屏的，默认是375的宽度，那么设计意图是做弹性布局铺满横向的宽度
    if (mapStyle['width'] == 375.0) {
      if (mapStyle.hasOwnProperty('left')) {
        mapStyle.right = 0;
      }
      delete mapStyle.width;
    }

    return mapStyle;
  };

  // parse function, return params and content
  const parseFunction = func => {
    const funcString = func.toString();
    const params = funcString.match(/\([^\(\)]*\)/)[0].slice(1, -1);
    const content = funcString.slice(
      funcString.indexOf('{') + 1,
      funcString.lastIndexOf('}')
    );
    return {
      params,
      content
    };
  };

  // parse layer props(static values or expression)
  const parseProps = (value, isReactNode) => {
    if (typeof value === 'string') {
      if (isExpression(value)) {
        if (isReactNode) {
          return value.slice(1, -1);
        } else {
          return value.slice(2, -2);
        }
      }

      if (isReactNode) {
        return value;
      } else {
        return `'${value}'`;
      }
    } else if (typeof value === 'function') {
      const { params, content } = parseFunction(value);
      return `(${params}) => {${content}}`;
    }
  };

  const parseChildren = (schema, props) => {
    let containerComponent = 'Column';
    if (
      schema.props.style &&
      schema.props.style.flexDirection &&
      schema.props.style.flexDirection === 'row'
    ) {
      containerComponent = 'Row';
    }

    const defalutRelativeLayoutStyle = {
      crossAxisAlignment: 'CrossAxisAlignment.start',
      mainAxisAlignment: 'MainAxisAlignment.start'
    };

    const flexMap = {
      'flex-start': 'start',
      'flex-end': 'end',
      center: 'center',
      'space-between': 'spaceBetween',
      'space-around': 'spaceAround',
      'space-evenly': 'spaceEvenly'
    };

    if (schema.props.style && schema.props.style.justifyContent) {
      defalutRelativeLayoutStyle.mainAxisAlignment = `MainAxisAlignment.${
        flexMap[schema.props.style.justifyContent]
      }`;
    }
    if (schema.props.style && schema.props.style.alignItems) {
      defalutRelativeLayoutStyle.crossAxisAlignment = `CrossAxisAlignment.${
        flexMap[schema.props.style.alignItems]
      }`;
    }

    const simpleLayout = createFunction(containerComponent, {
      ...defalutRelativeLayoutStyle,
      children: `<Widget>[${transform(schema.children)}]`
    });

    if (Object.keys(props).length > 0) {
      return createFunction('Container', {
        ...props,
        child: simpleLayout
      });
    }

    // flutter 默认线性布局都是居中形式，需要对齐 h5 的显示标准
    return simpleLayout;
  };

  const createListView = (schema, props) => {
    if (props.margin) props.padding = props.margin;
    return createFunction('ListView', {
      ...props,
      shrinkWrap: true,
      children: `<Widget>[${transform(schema.children)}]`
    });
  };

  const createText = (schema, styleProps) => {
    // 只提取text组件兼容的样式
    const TextStyleProps = ['fontSize', 'color'];

    const _textStyle = (function() {
      const _filterProp = {};
      const _filterPropKeys = Object.keys(styleProps).filter(
        key => ~TextStyleProps.indexOf(key)
      );
      _filterPropKeys.forEach(key => {
        _filterProp[key] = styleProps[key];
      });
      return _filterProp;
    })();

    // 默认的 flutter text 组件都是居中文字对齐，跟 页端实现有点差别，需要做处理
    const _textExtendStyle = {};
    _textExtendStyle.textAlign = `TextAlign.left`;
    if (styleProps['textAlign']) {
      if (styleProps['textAlign'] === 'center') {
        _textExtendStyle.textAlign = `TextAlign.center`;
      }
      if (styleProps['textAlign'] === 'right') {
        _textExtendStyle.textAlign = `TextAlign.right`;
      }
    }

    let TextComponent = `Text('${schema.props.text}',
      ${formatProps(_textExtendStyle)},
      style: TextStyle(${formatProps(_textStyle)})
    )`;

    if (styleProps.margin || styleProps.padding) {
      TextComponent = createFunction('Container', {
        child: TextComponent,
        ...styleProps
      });
    }

    return TextComponent;
  };

  const createImage = (schema, styleProps) => {
    const source = parseProps(schema.props.src);
    let ImageComponent = createFunction('Image', {
      image: `new NetworkImage(${source})`,
      fit: 'BoxFit.fill',
      ...styleProps
    });
    if (styleProps.margin || styleProps.padding) {
      ImageComponent = createFunction('Container', {
        child: ImageComponent,
        ...styleProps
      });
    }
    return ImageComponent;
  };

  const createExpanded = (schema, styleProps) => {
    return createFunction('Expanded', {
      ...styleProps,
      flex: 1,
      child: `${transform(schema.children)}`
    });
  };

  const createLinkToFunc = schema => {
    // 生成新的widget
    delete schema.smart;
    widgets.push(transform(schema, true));
    return `${schema.id}()`;
  };

  const createStack = (schema, styleProps) => {
    delete schema.props.style.position;
    // 抽离出子节点中存在 position: absolute 的节点，跟当前节点实际类型做重新组合
    const _children = schema.children || [];
    const _positioneds = _children.filter(
      item => item.props.style.position === 'absolute'
    );

    if (schema.children) {
      _positioneds.forEach(item => {
        schema.children.splice(schema.children.indexOf(item), 1);
      });
    }

    _positioneds.push(schema);

    return createFunction('Stack', {
      children: `<Widget>[${transform(_positioneds)}]`,
      ...styleProps
    });
  };

  const createPositioned = (schema, styleProps) => {
    delete schema.props.style.position;

    return createFunction('Positioned', {
      child: generateRender(schema),
      ...styleProps
    });
  };

  const createFunction = (functionName, props) => {
    if (functionName === 'Container') {
      delete props.color;
      decorationParam = {};
      if (props.backgroundColor) decorationParam.color = props.backgroundColor;
      if (props.borderRadius) decorationParam.borderRadius = props.borderRadius;
      if (Object.keys(decorationParam).length > 0) {
        props.decoration = `BoxDecoration(${Object.keys(decorationParam)
          .map(key => `${key}: ${decorationParam[key]}`)
          .join(',')})`;
      }
    }

    const common = ['style', 'child', 'children'].concat(
      STYLE_MAP[functionName]
    );
    props = (() => {
      const _props = {};
      for (let key in props) {
        if (common.indexOf(key) >= 0) {
          _props[key] = props[key];
        }
      }
      return _props;
    })();

    return `${functionName}(
      ${Object.keys(props)
        .map(key => `${key}: ${props[key]}`)
        .join(',\n')}
    )`;
  };

  // generate render xml
  const generateRender = schema => {
    let type = schema.componentName.toLowerCase();
    const styleProps = parseStyle(schema.props.style);
    let container = '';

    if (
      schema.smart &&
      schema.smart.layerProtocol &&
      schema.smart.layerProtocol.component
    ) {
      type = schema.smart.layerProtocol.component.type.toLowerCase();
    }

    if (
      schema.smart &&
      schema.smart.layerProtocol &&
      schema.smart.layerProtocol.group
    ) {
      type = schema.smart.layerProtocol.group.type.toLowerCase();
    }

    // stack
    if (schema.props.style.position === 'relative') {
      type = 'stack';
    }

    // position
    if (schema.props.style.position === 'absolute') {
      type = 'positioned';
    }

    switch (type) {
      case 'text':
        container = createText(schema, styleProps);
        break;
      case 'image':
        container = createImage(schema, styleProps);
        break;
      case 'listview':
        container = createListView(schema, styleProps);
        break;
      case 'expanded':
        container = createExpanded(schema, styleProps);
        break;
      case 'group':
        container = createLinkToFunc(schema);
        break;
      case 'stack':
        try {
          container = createStack(schema, styleProps);
        } catch (e) {
          console.error(e);
        }
        break;
      case 'positioned':
        try {
          container = createPositioned(schema, styleProps);
        } catch (e) {
          console.error(e);
        }
        break;
      case 'div':
      case 'page':
      case 'block':
      case 'component':
        if (schema.children && schema.children.length) {
          if (schema.children.length > 1) {
            container = parseChildren(schema, styleProps);
          } else {
            container = createFunction('Container', {
              child: transform(schema.children),
              ...styleProps
            });
          }
        } else {
          container = createFunction('Container', styleProps);
        }
        break;
    }

    return container;
  };

  // parse schema
  const transform = (schema, isGroup = false) => {
    let result = '';

    if (Array.isArray(schema)) {
      schema.forEach((layer, index) => {
        result += transform(layer);
        if (index < schema.length - 1) {
          result += ',\n';
        }
      });
    } else {
      let type = schema.componentName.toLowerCase();

      if (
        schema.smart &&
        schema.smart.layerProtocol &&
        schema.smart.layerProtocol.group
      ) {
        type = schema.smart.layerProtocol.group.type.toLowerCase();
      }

      if (['page', 'block', 'component'].indexOf(type) !== -1 || isGroup) {
        let componentName = `${schema.componentName}${classes.length}`;
        componentName =
          componentName.slice(0, 1).toUpperCase() + componentName.slice(1);

        if (!isGroup) classes.push(schema.props.className);
        if (isGroup) componentName = schema.id;

        if (schema.state) {
          result += statefulWidget(componentName, generateRender(schema));
        } else {
          result += statelessWidget(componentName, generateRender(schema));
        }
      } else {
        result += generateRender(schema);
      }
    }

    return result;
  };

  if (option.utils) {
    Object.keys(option.utils).forEach(name => {
      utils.push(`const ${name} = ${option.utils[name]}`);
    });
  }

  // start parse schema
  let result = transform(schema);
  result += widgets.join('\n');

  const prettierOpt = {
    parser: 'markdown',
    printWidth: 80,
    singleQuote: true
  };

  return {
    panelDisplay: [
      {
        panelName: `index.dart`,
        panelValue: prettier.format(`import 'package:flutter/material.dart';
          ${result}`, prettierOpt),
        panelType: 'javascript',
      }
    ],
    renderData: {
      result
    },
    prettierOpt,
    noTemplate: true
  };
};
