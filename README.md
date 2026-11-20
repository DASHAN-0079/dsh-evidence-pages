# dsh-evidence-pages

让 DSH 在压缩长工具输出后还能按位置读回原文。例如测试失败用例名埋在上万字日志的中段，插件可以保留含用例名的一小段，以及指向同一份日志的地址。默认在本地按规则选段，无需 SuperAgent、Jevos 服务或选页 API 密钥。

## 安装并启用

已验证的组合为 **DeepSeek Harness 0.2.2-rc.5、headless profile、Node.js ≥24.9**。在装有该版本 DSH 的机器上，克隆固定版本并从源码目录执行以下命令。包内提供可直接运行的 JavaScript，无需编译。

```sh
git clone --branch v0.3.0 https://github.com/DASHAN-0079/dsh-evidence-pages.git
cd dsh-evidence-pages
npm pack
dsh plugin --profile headless add ./dsh-evidence-pages-0.3.0.tgz
dsh --profile headless --patch ./preset/headless.patch.yml --dump-config
```

在输出中查找 `evidence-page-compaction`、`evidence-page-pruner`、`evidence-page-reader`。三项都应启用，原来的 `compaction-basic` 和 `tool-result-pruner` 应带有 `disabled: true`。然后用同一份补丁启动实际会话：

```sh
dsh --profile headless --patch ./preset/headless.patch.yml "运行项目测试并保留失败用例名"
```

安装包只注册插件。上面的 `--patch` 才在这次启动中启用它。从其他目录启动时请传补丁的绝对路径。日常使用可把该参数加进自己的启动命令。已有第三方压缩器的 profile 应先核对这两项服务归谁管理，避免同时启用两个实现。Web / Desktop 或 SuperAgent 的 Agent preset 可能有独立作用域，本次发布验证覆盖 headless。

## 确认压缩和回读都生效

实际触发压缩后，选页成功的 `compaction/summary` 事件会记录 `provider=dsh-evidence-pages` 和 `model=rule`。摘要正文会出现类似 `[evidence_page seq=5 charOffset=5376]` 的引用；这两个数字以当前会话实际返回的为准。让 Agent 在同一会话用该引用调用 `evidence_page`。返回首行含当前位置、总长度和下一页位置，随后是原文。偏移按 Unicode 码点计算，页头也计入读取预算。原始事件随会话日志一起保存，日志删除后引用也随之失效。

如果想在干净环境重复发布验收，可以在这个仓库运行：

```sh
npm ci
npm test
node verify/headless.mjs "/absolute/path/to/dsh/lib/bin.js" ./dsh-evidence-pages-0.3.0.tgz
```

第一个参数是已安装的 `@deepseek-ai/dsh` 包的 CLI 入口。脚本新建临时 DSH home，安装刚才打出的包，把一份含中文和 emoji 的长测试日志送进真实宿主的剪枝器和压缩器，再用注册的工具从重放后的会话读回 `FAIL CASE_8317`。最后卸载并比对原生配置。验收专用补丁把 headless 的对话运行器换成确定性日志样例，剪枝器、压缩器和回读工具都来自安装后的 profile。脚本显式触发压缩，无需配置模型。0.3.0 验收记录为 `model=rule`、`seq=5`、`charOffset=5376`，卸载后的配置与安装前一致。

## 策略和数据去向

| 策略 | 作用 |
|---|---|
| `rule`（默认） | 综合用户请求、压缩前的最新目标、工具名和参数的词汇重合，以及错误或标识符线索，选一页原文。选页在本地执行。 |
| `jevos`（可选） | 把相同候选交给 System One 的 choice 接口，由 Jevos 直接选一页。 |
| `pointer` / `glm` | 实验对照，分别只留原文地址、用宿主配置的模型选页。 |

每个长工具结果最多列出 12 个候选，每段最多 256 个码点，选中一段。规则不保证命中正确段；整段会话也没有固定的总 token 预算。包含图像、无法对齐原事件、选页失败或压缩收益不足时，可交给 DSH 原生摘要，这一步可能调用宿主配置的模型。

要启用 Jevos，请先自行配置可用的 System One 服务。在启动 DSH 的终端设置 `DSH_EVIDENCE_POLICY=jevos`。默认地址为 `http://127.0.0.1:18017/v1/systemone`，默认模型为 `jevos-v5`。可用 `DSH_EVIDENCE_JEV_URL`、`DSH_EVIDENCE_JEV_MODEL`、`DSH_EVIDENCE_JEV_KEY` 覆盖。服务会收到候选原文、压缩时已知的用户目标和工具调用信息，请选择有权接收这些数据的地址。恢复规则可删除策略环境变量，或显式设为 `rule`，再重启 DSH。

## 卸载

退出已启用插件的 DSH 进程，从启动命令移除 `--patch ./preset/headless.patch.yml`。若曾手工把补丁合并进 profile，先撤回那几行，恢复原压缩器和剪枝器的设置。执行：

```sh
dsh plugin --profile headless remove dsh-evidence-pages
dsh --profile headless --dump-config
```

确认原生 `compaction-basic` 和 `tool-result-pruner` 启用，三个 `evidence-page-*` 服务消失。旧摘要里的引用文本仍在，调用 `evidence_page` 需要重新启用插件。

## 来源与许可

从 [SuperAgent rc.5 适配仓的插件目录](https://github.com/DASHAN-0079/dsh-superagent-adapt/tree/3463107/plugins/dsh-evidence-pages) 拆分。独立版本从 0.3.0 起维护。使用 MIT 许可证。
