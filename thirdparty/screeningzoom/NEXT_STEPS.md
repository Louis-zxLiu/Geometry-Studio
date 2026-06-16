# ScreeningZoom 下一步

## 已完成

- PlotKityCat 主程序侧独立桥接
- helper 进程路径、启动、协议定义
- ZoomIt 副本中命令行参数入口
- stdin-json 控制入口
- `targetHwnd` 记录与 `sourceRect` 裁剪
- 右键短按菜单
- 右键拖拽设置区域并触发 zoom
- 独立 helper 工程骨架：`helper/ScreeningZoomHelper.vcxproj`
- helper 本地 shim 依赖：`helper/shims/`

## 未完成

1. 用新 helper 工程实际编出第一轮错误清单
2. 处理 `pch.h` / `Zoomit.cpp` 中录屏、摄像头、DemoType、WinRT 录制链残余依赖
3. 把最小编译集接成 `screeningzoom-helper.exe`
4. 如有必要，为右键拖拽补可视化框选反馈

## 推荐顺序

1. 用 `helper/ScreeningZoomHelper.vcxproj` 开始编
2. 编译报错一个个裁
3. 出第一版 exe 后接发布脚本
4. 最后再考虑拖拽框选的可视反馈
