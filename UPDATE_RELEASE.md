# PlotKityCat 更新发布说明

这份文档只负责发布与在线更新，不解释 runtime 从零重建。runtime 重建流程单独见 [RUNTIME_BUILD.md](D:/projects/plotkitycat/RUNTIME_BUILD.md)。

当前发布模型：

- 更新客户端只更新 `exe`
- runtime 走整包发布，不走在线更新
- 更新服务器固定为 `https://update.5051001.xyz/plotkitycat`
- 服务端只需要维护：
  - `stable/manifest.json`
  - `releases/PlotKityCat-版本号-windows-amd64.exe`

runtime 约定：

- `resources/runtime/runtime.zip` 默认不提交到 Git
- 它应作为 release asset 或其他外部分发制品单独保存
- 推荐命名为与应用版本对应的 release asset
- 从零重建 runtime 的流程见 [RUNTIME_BUILD.md](D:/projects/plotkitycat/RUNTIME_BUILD.md)

## 1. 先改版本号

编辑：

- [version.json](/D:/projects/PlotKityCat/version.json)

把 `appVersion` 改成要发布的版本，例如：

```json
{
  "appVersion": "0.0.1.9"
}
```

相关脚本如果不手动传 `-Version`，都会默认读取这里的 `appVersion`：

- `tools/build-versioned-app.ps1`
- `tools/prepare-update-release.ps1`
- `tools/package-release.ps1`

## 2. 构建应用 exe

在仓库根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\build-versioned-app.ps1
```

或者显式指定版本：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\build-versioned-app.ps1 -Version 0.0.1.9
```

产物：

- [build/bin/PlotKityCat.exe](/D:/projects/PlotKityCat/build/bin/PlotKityCat.exe)

## 3. 生成在线更新产物

运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\prepare-update-release.ps1
```

或者：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\prepare-update-release.ps1 -Version 0.0.1.9
```

产物目录：

- [build/update](/D:/projects/PlotKityCat/build/update)

对应版本目录里会生成：

- `PlotKityCat-0.0.1.9-windows-amd64.exe`
- `manifest.json`

说明：

- `manifest.json` 会自动写入下载地址和 sha256
- 默认下载地址前缀是 `https://update.5051001.xyz/plotkitycat/releases`

## 4. 生成完整下载包

运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\package-release.ps1
```

或者：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\package-release.ps1 -Version 0.0.1.9
```

产物：

- 便携目录：`build/release/PlotKityCat-v0.0.1.9`
- 压缩包：`build/release/PlotKityCat-v0.0.1.9.zip`

说明：

- 这个 zip 会包含 `PlotKityCat.exe`、`resources/runtime/runtime.zip` 和 `Scripts/`
- 因此发布完整包前，必须先在本地准备好 `resources/runtime/runtime.zip`

## 5. 上传到更新服务器

服务器：

- `root@149.28.135.102`

更新文件目录：

- `/var/www/update.5051001.xyz/plotkitycat/releases/`
- `/var/www/update.5051001.xyz/plotkitycat/stable/`

先上传版本 exe：

```powershell
scp .\build\update\0.0.1.9\PlotKityCat-0.0.1.9-windows-amd64.exe root@149.28.135.102:/var/www/update.5051001.xyz/plotkitycat/releases/
```

再上传 manifest：

```powershell
scp .\build\update\0.0.1.9\manifest.json root@149.28.135.102:/var/www/update.5051001.xyz/plotkitycat/stable/manifest.json
```

注意：

- 先传 exe，再覆盖 `stable/manifest.json`
- 因为客户端一旦读到新的 manifest，就会按里面的 URL 去下载 exe

## 6. 发布后验证

本机先验证 manifest：

```powershell
curl.exe -I https://update.5051001.xyz/plotkitycat/stable/manifest.json
```

再验证 exe：

```powershell
curl.exe -I https://update.5051001.xyz/plotkitycat/releases/PlotKityCat-0.0.1.9-windows-amd64.exe
```

如果都返回 `200 OK`，说明更新源可用。

## 7. 最短发布流程

只记最短流程时，按这个顺序执行：

1. 改 [version.json](/D:/projects/PlotKityCat/version.json) 的 `appVersion`
2. 跑 `.\tools\build-versioned-app.ps1`
3. 跑 `.\tools\prepare-update-release.ps1`
4. 跑 `.\tools\package-release.ps1`
5. 上传 `build/update/版本号/` 里的 `exe`
6. 把 `build/update/版本号/manifest.json` 覆盖到服务器 `stable/manifest.json`

## 8. 固定约定

- 更新 manifest 地址：`https://update.5051001.xyz/plotkitycat/stable/manifest.json`
- 更新 exe 文件名格式：`PlotKityCat-版本号-windows-amd64.exe`
- 完整发布包目录格式：`build/release/PlotKityCat-v版本号`
- 完整发布包 zip 格式：`build/release/PlotKityCat-v版本号.zip`
- runtime asset 建议格式：`PlotKityCat-runtime-版本号.zip`

## 9. 只发完整包，不更新在线更新

只需要：

1. 改 `version.json`
2. 跑 `.\tools\build-versioned-app.ps1`
3. 跑 `.\tools\package-release.ps1`

这样会得到完整 zip，但不会更新服务器上的在线更新入口。

## 10. 常见问题

### Q1. 不传 `-Version` 会怎样？

会自动读取 [version.json](/D:/projects/PlotKityCat/version.json) 里的 `appVersion`。

### Q2. 用户点“检查更新”实际读哪里？

固定读：

- `https://update.5051001.xyz/plotkitycat/stable/manifest.json`

### Q3. 为什么一定要最后再传 manifest？

因为 manifest 一更新，旧版本客户端就可能立刻看到新版本；如果这时 exe 还没上传完，下载会失败。

### Q4. 哪些目录不该进 git？

这些产物目录本来就已经忽略：

- `build/bin/`
- `build/release/`
- `build/update/`
