# Built Helper Output

标准开发态 helper 输出位置：

- `thirdparty/screeningzoom/bin/screeningzoom-helper.exe`

PlotKityCat 的 Go 桥接层会优先在这里查找 helper。

如果要同时给打包态使用，可再运行：

```powershell
.\tools\screeningzoom\publish-helper.ps1 -BuiltHelperPath <你的 exe 路径>
```
