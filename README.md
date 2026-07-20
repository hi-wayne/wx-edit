# 公众号AI心流写作台

一个面向微信公众号文章的 Codex 辅助写作与本地预览编辑器。

## 给完全不懂 GitHub 的用户

1. 先下载安装 Codex：

   https://openai.com/zh-Hans-CN/codex/

2. 打开 Codex，并用自己的 ChatGPT/Codex 账号登录。

3. 在 Codex 里创建一个新项目：

   - 打开 Codex
   - 选择创建新项目或新任务
   - 如果 Codex 让你选择本地文件夹，可以新建一个空文件夹，例如 `wx-edit-workspace`
   - 进入项目后，把下面这句话发给 Codex

```text
请从 https://github.com/hi-wayne/wx-edit 下载公众号AI心流写作台，完成安装和启动，然后告诉我打开哪个本地网址使用。
```

如果用户已经在 Codex 项目里，也可以直接对 Codex 说这一句话：

```text
请从 https://github.com/hi-wayne/wx-edit 下载公众号AI心流写作台，完成安装和启动，然后告诉我打开哪个本地网址使用。
```

Codex 会自动判断用户电脑有没有 `git`。有 `git` 时可以这样：

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
- `.wx-editor/article.wechat.html`：导出的微信公众号 HTML
- `.wx-editor/article.md`：导出的 Markdown
- `skills/wx-article`：Codex skill
- `packages/wechat-renderer`：微信公众号 HTML 渲染与兼容性检查

## 当前能力

- 本地浏览器手机宽度预览
- 自由富文本编辑
- 左侧工具：正文、小标题、三级标题、引用、无序/有序列表、加粗、斜体、下划线、删除线、颜色、标注、清格式、对齐、缩进、链接、本地图片、分隔线、模板片段、图片占位
- 选中图片后显示图片工具：宽度、对齐、说明、替换、删除、恢复默认
- 右侧 AI 辅助：选中文字后润色、缩短、扩写、查错、自定义要求
- AI 插入：读取全文和最后光标位置，按提示词新增内容
- 配图：不需要选区；优先参考选区，没有选区时参考全文和光标附近内容
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

编辑器支持三种配图方式：

- 默认：没有 API key 时，先从 Wikimedia Commons 搜索并下载真实图片到 `.wx-editor/assets`；如果没有找到合适图片，再生成本地 SVG 占位图。
- OpenAI 图片 API：配置 API key 后，使用 GPT Image 生成 PNG 图片，保存到 `.wx-editor/assets` 并插入正文。
- Codex 对话辅助：用户可以回到 Codex 对话里要求 Codex 用当前对话的图片能力生成图片，再由 Codex 保存并插入文章。这不是浏览器按钮可直接调用的稳定 API。

启用真实图片生成：

```bash
export WX_IMAGE_PROVIDER=openai-api
export OPENAI_API_KEY=<你的 OpenAI API Key>
export WX_IMAGE_MODEL=gpt-image-2
pnpm dev
```

只想禁用真实图片搜索、退回本地占位图：

```bash
export WX_IMAGE_PROVIDER=placeholder
pnpm dev
```

说明：`codex login` 使用的是 ChatGPT/Codex 订阅登录态，适合本机 Codex 文本改写；它目前没有给这个本地 HTTP 服务暴露“直接调用 ChatGPT 图片生成工具”的稳定接口。当前 Codex 对话里的内置图片生成能力可以由 Codex 本人使用，但不能被下载后的普通本地服务直接当 API 调用。
