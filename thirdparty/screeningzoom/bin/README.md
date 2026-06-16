# Built Helper Output

这里存放开发态 `ScreeningZoom` helper 产物：

- `thirdparty/screeningzoom/bin/screeningzoom-helper.exe`

PlotKityCat 在找不到 `resources/screeningzoom/screeningzoom-helper.exe` 时，会回退到这里。

通常不需要手动复制，直接运行：

```powershell
.\tools\screeningzoom\build-and-publish-helper.ps1 -Configuration Release
```
