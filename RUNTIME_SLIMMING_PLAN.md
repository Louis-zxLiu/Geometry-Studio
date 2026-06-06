# PlotKityCat Runtime 瘦身方案

## 目标

这份文档只回答一件事：

- 当前 Windows 发布包里的 Python runtime，哪些内容原则上不该进入最终交付物
- 哪些 Qt 组件可以分梯队裁剪
- 保守到激进，最终大概可以压缩多少体积

当前基线：

- `resources/runtime/runtime.zip`: 约 `297.53 MB`

建议先把目标定成：

- 第一阶段目标：压到 `220 MB` 左右
- 第二阶段目标：压到 `180 MB` 左右

一个便于沟通的单一数字是：

- **预估可压缩约 `120 MB`**

也就是把 `runtime.zip` 从约 `297.53 MB` 压到约 `175 MB - 195 MB`。

## 运行时主链

当前产品代码明确声明和使用的 runtime 主链是：

- `python`
- `numpy`
- `matplotlib`
- `scipy`
- `PyQt5`

当前绘图后端为：

- `MPLBACKEND=Qt5Agg`

这意味着最终 runtime 只需要保证下面这条链稳定：

- Python 解释器
- Matplotlib
- NumPy / SciPy
- PyQt5 的 Qt Widgets 图形运行能力

它不需要携带一整套 WinPython 开发环境。

## 可删除的第三方库

下面这些包，从当前仓库代码依赖看，不属于 PlotKityCat 的核心运行依赖。

这些体积是本地 runtime 解压后的近似值。由于其中多数是二进制或大量字节码文件，它们对 `runtime.zip` 的最终体积也会产生明显影响。

### 优先删除

- `scs.libs`: `26.71 MB`
  用途：优化求解器底层动态库，通常服务 `scs/cvxpy`
- `pythonwin`: `8.88 MB`
  用途：Windows 下的 Python 开发工具
- `google`: `4.24 MB`
  用途：Google 相关 Python SDK 命名空间
- `networkx`: `3.82 MB`
  用途：图算法库
- `xarray`: `3.53 MB`
  用途：多维标注数组数据分析
- `pyqtgraph`: `3.39 MB`
  用途：另一套 Qt 绘图库
- `PyWin32.chm`: `2.52 MB`
  用途：帮助文档
- `plotpy`: `2.37 MB`
  用途：另一套 plotting 框架
- `tiktoken`: `2.24 MB`
  用途：tokenizer
- `clarabel`: `2.11 MB`
  用途：优化求解器
- `huggingface_hub`: `1.97 MB`
  用途：模型仓库客户端
- `langchain_core`: `1.96 MB`
  用途：LangChain 核心
- `qdarkstyle`: `1.91 MB`
  用途：Qt 主题库
- `IPython`: `1.88 MB`
  用途：交互式 Python Shell
- `pylint`: `1.72 MB`
  用途：静态检查
- `cvxpy`: `1.58 MB`
  用途：凸优化建模
- `datasette`: `1.27 MB`
  用途：SQLite 浏览服务
- `seaborn`: `0.98 MB`
  用途：统计绘图库
- `astroid`: `0.97 MB`
  用途：`pylint` 依赖
- `datasette_graphql`: `0.90 MB`
  用途：Datasette 插件
- `black`: `0.65 MB`
  用途：代码格式化
- `langchain`: `0.39 MB`
  用途：LangChain 高层封装
- `isort`: `0.31 MB`
  用途：import 排序
- `nbconvert`: `0.26 MB`
  用途：Notebook 导出
- `nbformat`: `0.26 MB`
  用途：Notebook 格式
- `nbclient`: `0.07 MB`
  用途：执行 Notebook

### 同类可一并清理

- `jupyter*`
- `notebook*`
- `ipython_genutils`
- `blackd`
- `pylint_venv`
- `qtpy`

### 这批的预估收益

- 保守：`30 MB - 60 MB`
- 中等：`45 MB - 75 MB`

## Qt 裁剪梯队

Qt 是当前 runtime 里最值得单独处理的部分。

本地 `PyQt5/Qt5` 目录的大头约为：

- `bin`: `177.71 MB`
- `translations`: `25.79 MB`
- `qml`: `18.05 MB`
- `resources`: `15.24 MB`
- `plugins`: `12.01 MB`

### 第一梯队

这是最值得先裁的一组。

- `QtWebEngine` 相关整组

本地测得的原始体积约：

- `97.28 MB`

主要包括：

- `Qt5WebEngineCore.dll`
- `qtwebengine_resources.pak`
- `qtwebengine_devtools_resources.pak`
- `qtwebengine_resources_100p.pak`
- `qtwebengine_resources_200p.pak`
- `icudtl.dat`
- `translations/qtwebengine_locales/`

建议：

- 如果应用没有任何 `QWebEngineView`、嵌入浏览器、HTML 渲染主界面需求，优先整组裁掉

预估对最终 `runtime.zip` 的收益：

- `60 MB - 90 MB`

风险判断：

- **中低风险**

原因：

- 当前产品运行链是 `Matplotlib + Qt5Agg`
- Matplotlib Qt backend 直接使用的是 `QtCore / QtGui / QtWidgets`
- WebEngine 是独立部署子系统，不是 Widgets 绘图窗口的基础依赖

### 第二梯队

这一组可以继续裁，但收益小于第一梯队。

- `Qt5Designer.dll`
- `Qt5XmlPatterns.dll`
- `Qt5Location.dll`
- `Qt5Multimedia.dll`
- `plugins/platforms/qminimal.dll`
- `plugins/platforms/qoffscreen.dll`
- `plugins/assetimporters/`
- `plugins/renderers/`
- `plugins/sqldrivers/`

本地测得的大致原始体积：

- `Designer / Xml / Location / Multimedia`: `4.28 MB`
- `qminimal + qoffscreen`: `0.81 MB`
- `assetimporters + renderers + sqldrivers`: `1.85 MB`

预估对最终 `runtime.zip` 的收益：

- `3 MB - 8 MB`

风险判断：

- **中风险**

原因：

- 这批不在 Matplotlib Qt5Agg 主链上
- 但 Qt 存在运行时动态加载机制，边缘路径更难仅靠静态 import 判断

### 不建议动的部分

下面这批不建议在第一轮瘦身里碰：

- `Qt5Core.dll`
- `Qt5Gui.dll`
- `Qt5Widgets.dll`
- `plugins/platforms/qwindows.dll`

风险判断：

- **高风险**

原因：

- 这些是 Matplotlib Qt backend 的主链依赖
- 删除后最常见结果不是“功能退化”，而是“图窗直接起不来”

## 建议的压缩路径

### 方案 A：只清理无关第三方库

预估：

- `297.53 MB -> 240 MB - 265 MB`

### 方案 B：第三方库 + Qt 第一梯队

预估：

- `297.53 MB -> 180 MB - 230 MB`

### 方案 C：第三方库 + Qt 第一梯队 + Qt 第二梯队

预估：

- `297.53 MB -> 175 MB - 220 MB`

建议对外统一报的目标值：

- **压缩约 `120 MB`**

## 场景验证建议

不建议一次性大删后凭感觉验收。建议至少按下面的手工场景验证：

### 主链验证

- 启动应用
- 新建场景
- 运行最简单的 `plt.plot([1, 2, 3])`
- 确认图窗能正常弹出和关闭
- 连续运行两次，确认不是只有第一次成功

### Qt5Agg 交互验证

- `matplotlib.widgets.Slider`
- `Button`
- `CheckButtons`
- 缩放、平移、保存图片
- 同时打开多个 figure

### 项目特有验证

- 运行 `3D surface` 场景
- 运行使用 `Poly3DCollection` 的场景
- 验证 `surface-fastpath` 没有被误伤
- 导入导出场景包后再次运行

### 边缘验证

- 保存文件对话框是否正常
- 高 DPI 屏幕是否正常
- 长时间运行后再次打开图窗是否正常

## 官方文档依据

- Python embeddable package
  https://docs.python.org/3/using/windows.html#the-embeddable-package
- Matplotlib backends
  https://matplotlib.org/stable/users/explain/figure/backends.html
- Matplotlib Qt backend API
  https://matplotlib.org/stable/api/backend_qt_api.html
- Qt WebEngine deployment
  https://doc.qt.io/qt-6/qtwebengine-deploying.html
- Qt plugin deployment
  https://doc.qt.io/qt-6/deployment-plugins.html
