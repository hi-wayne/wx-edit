# 公众号AI心流写作台

一个面向微信公众号文章的 Codex 辅助写作与本地预览编辑器。

## 给完全不懂 GitHub 的用户

1. 先下载安装 Codex：

   https://openai.com/zh-Hans-CN/codex/

2. 打开 Codex，并用自己的 ChatGPT/Codex 账号登录。

3. 在 Codex 里创建一个新项目：

   - 打开 Codex
   - 在左侧项目中点击 `+` 号，选择“使用现有文件夹”
   - 在弹窗中创建一个文件夹，例如 `wx-edit-workspace`，然后选中它
   - 进入项目对话框后，把下面这句话发给 Codex

```text
请从 https://github.com/hi-wayne/wx-edit 下载公众号AI心流写作台，完成安装和启动，然后告诉我打开哪个本地网址使用。
```

如果用户已经在 Codex 项目里，也可以直接对 Codex 说这一句话：

```text
请从 https://github.com/hi-wayne/wx-edit 下载公众号AI心流写作台，完成安装和启动，然后告诉我打开哪个本地网址使用。
```

Codex 会自动判断用户电脑有没有 `git` 和 Node.js 20+。用户不需要 GitHub 账号；公共仓库可以直接下载。新电脑如果还没有 Node.js，Codex 会先帮用户安装或提示安装 Node.js 20+，然后再启动服务。

有 `git` 时可以这样：

```bash
git clone https://github.com/hi-wayne/wx-edit.git
cd wx-edit
bash scripts/bootstrap.sh
```

没有 `git` 时，Codex 应该改用 GitHub 的 ZIP 下载：

```bash
mkdir -p wx-edit-download
cd wx-edit-download
curl -L https://github.com/hi-wayne/wx-edit/archive/refs/heads/main.zip -o wx-edit.zip
unzip -q wx-edit.zip
cd wx-edit-main
bash scripts/bootstrap.sh
```

如果是 Windows 且没有 `curl/unzip`，Codex 可以用 PowerShell：

```powershell
mkdir wx-edit-download
cd wx-edit-download
Invoke-WebRequest -Uri https://github.com/hi-wayne/wx-edit/archive/refs/heads/main.zip -OutFile wx-edit.zip
Expand-Archive wx-edit.zip -DestinationPath .
cd wx-edit-main
bash scripts/bootstrap.sh
```

启动成功后，在浏览器打开：

```text
http://localhost:3000/
```

如果用户已经把仓库下载到了本地，只需要在项目目录里运行：

```bash
bash scripts/bootstrap.sh
```

如果启动脚本提示缺少 Node.js，请让 Codex 先安装 Node.js 20+，再重新运行：

```text
请先帮我安装 Node.js 20+，然后重新运行 bash scripts/bootstrap.sh 启动这个项目。
```

## 目标工作流

1. 用户在 Codex 里提供主题、草稿或修改要求。
2. Codex 使用 `wx-article` skill 生成或修改 `.wx-editor/article.json`。
3. 用户打开本地浏览器编辑器 `http://localhost:3000`。
4. 用户在自由富文本画布里写作，使用左侧工具处理段落、小标题、引用、列表、颜色、分隔线、模板片段、本地图片和图片大小。
5. 用户选中文字后，右侧 AI 辅助提供润色、缩短、扩写、查错和自定义处理。
6. 用户不选文本时，也可以使用 AI 插入和配图；AI 插入会读取全文并在最后光标位置补内容。
7. 完成后复制微信兼容 HTML 到微信公众号后台。

## 本地开发

```bash
pnpm install
codex login
pnpm dev
```

也可以直接运行：

```bash
pnpm setup
```

默认端口是 `3000`，可以用环境变量修改：

```bash
PORT=3001 pnpm dev
```

## 重要文件

- `.wx-editor/article.json`：文章结构化源文件
- `.wx-editor/request.json`：浏览器提交给 Codex 的最新 AI 修改请求
- `.wx-editor/image-request.json`：浏览器提交给 Codex 的最新 imagegen 生图请求
- `.wx-editor/article.wechat.html`：导出的微信公众号 HTML
- `.wx-editor/article.md`：导出的 Markdown
- `skills/wx-article`：Codex skill
- `packages/wechat-renderer`：微信公众号 HTML 渲染与兼容性检查

## 当前能力

- 本地浏览器手机宽度预览
- 自由富文本编辑
- 顶部新建文章：清空当前文章并创建空白稿，可选择同时清空文章风格要求
- 左侧工具：正文、小标题、三级标题、引用、无序/有序列表、加粗、斜体、下划线、删除线、颜色、标注、清格式、对齐、缩进、链接、本地图片、分隔线、模板片段、图片占位
- 选中图片后显示图片工具：宽度、对齐、说明、替换、删除、恢复默认
- AI 辅助可设置文章风格要求，后续润色、缩短、扩写、查错、自定义、AI 插入和配图都会把它作为统一写作协议执行，并在输出前自检
- AI 辅助提供提示词说明弹窗，可查看各功能核心提示词和叠加规则
- 右侧 AI 辅助：选中文字后润色、缩短、扩写、查错、自定义要求；可选择是否参考全文上下文，参考全文时也只回填选区
- AI 处理过程会流式展示请求摘要、可观察的思考/状态、输出和回填结果
- 润色、缩短、扩写、查错等普通 AI 编辑默认禁止插图；只有 `配图` 或明确要求图片的 `AI 插入/自定义` 才会进入图片流程
- AI 插入：读取全文和最后光标位置，按提示词新增内容
- 配图：不需要选区；优先参考选区，没有选区时参考全文和光标附近内容
- 配图面板：`请求 Codex 生图` 会写入 `.wx-editor/image-request.json`，让 Codex 使用 `imagegen` skill 生成图片并插入文章
- 使用 `codex login` 登录后，AI 按钮会直接调用本机 Codex 并回填正文
- 微信兼容 HTML 导出
- Markdown 导出

## 后续发布 API 计划

第一版先提供复制/导出，避免用户被公众号 API 权限、IP 白名单、素材上传和审核流程阻塞。

后续可以增加：

- AppID/AppSecret 本地配置
- access_token 获取
- 封面图永久素材上传
- 正文图片上传并替换 URL
- 创建草稿
- 提交发布
- 发布状态轮询

AppSecret 只能保存在本地 secret 文件或系统凭据中，不能写入前端代码或提交到仓库。

## AI 直连

编辑器默认通过本地服务调用本机 Codex CLI，因此用户只需要是 Codex/ChatGPT 订阅用户并完成登录，不需要 OpenAI API token：

```bash
codex login
pnpm dev
```

如果 Codex 登录不可用，编辑器会把请求保存到 `.wx-editor/request.json`，方便 Codex 手动处理。

也可以主动切换到 OpenAI API Key 模式：

```bash
export WX_AI_PROVIDER=openai-api
export OPENAI_API_KEY=<你的 OpenAI API Key>
export OPENAI_MODEL=gpt-5.1
pnpm dev
```

## 图片生成

编辑器支持两种配图方式：

- Codex 对话辅助：如果你的 Codex 客户端带有内置 `imagegen` skill，可以回到 Codex 对话里要求 Codex 生成图片、保存到 `.wx-editor/assets` 并插入文章。这个路径使用 Codex 当前对话能力，不需要 OpenAI API token。
- OpenAI 图片 API：如果你自己有 API key，也可以配置服务端能力，让本地服务直接调用 GPT Image 生成 PNG 图片，保存到 `.wx-editor/assets` 并插入正文。

新用户只安装 Codex 时，`bash scripts/bootstrap.sh` 会自动安装本项目的 `wx-article` skill，并检测本机 Codex 是否带有 `imagegen`。`imagegen` 是 Codex 客户端内置能力，不是本仓库能替用户强行安装的 npm 依赖；如果检测不到，编辑器仍然能正常写作、改写和排版，只是 `请求 Codex 生图` 需要用户更新或重启 Codex 后再用。

使用 Codex 对话辅助生图时，按这几步做：

1. 在浏览器编辑器里点击 `AI 插图`，填写或留空配图提示词。
2. 点击 `请求 Codex 生图`。编辑器会把请求写入 `.wx-editor/image-request.json`，右侧会出现“下一步：让 Codex 生成并插入图片”的操作卡片。
3. 回到当前这个 Codex 项目的对话窗口。
4. 把操作卡片里的这句话发给 Codex：

```text
请处理 wx-edit 的最新配图请求：读取 .wx-editor/image-request.json，使用 imagegen skill 生成一张适合微信公众号正文的真实图片，保存到 .wx-editor/assets，然后把图片作为 figure 插入 .wx-editor/article.json 对应位置。完成后告诉我回到 http://localhost:3000/ 刷新预览。
```

5. 等 Codex 处理完成后，回到浏览器 `http://localhost:3000/`，刷新或等待预览自动更新。

启用服务端 OpenAI 图片生成：

```bash
export WX_IMAGE_PROVIDER=openai-api
export OPENAI_API_KEY=<你的 OpenAI API Key>
export WX_IMAGE_MODEL=gpt-image-2
pnpm dev
```

说明：`codex login` 使用的是 ChatGPT/Codex 订阅登录态，适合本机 Codex 文本改写；它目前没有给这个本地 HTTP 服务暴露“直接调用 ChatGPT 图片生成工具”的稳定接口。当前 Codex 对话里的内置图片生成能力可以由 Codex 本人使用，但不能被下载后的普通本地服务直接当 API 调用。
