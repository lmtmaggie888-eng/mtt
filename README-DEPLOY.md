# 部署到固定公网地址

目标：给公众号一个稳定的 HTTPS 回调地址，避免临时 tunnel 反复失效。

推荐先用 Render 部署，因为它可以给 Node 服务挂持久磁盘，适合当前这个项目的 JSON 文件存储。

现在这个站点默认自带一套可用的记账 / 待办 / 日程能力，不再要求公网环境必须能访问你电脑上的本地 Python 服务。
如果你后面单独部署了 `wechat-life-os`，再额外配置 `LIFE_OS_API_BASE` 就能把请求转发过去。

## 部署前

项目需要这些环境变量：

```env
WECHAT_TOKEN=lmtmaggie666
DATA_DIR=/var/data
LIFE_OS_API_BASE=
```

`WECHAT_TOKEN` 要和微信公众号后台里的 Token 完全一致。

## Render 部署步骤

1. 打开 Render
   - https://render.com/

2. 新建 Web Service
   - 选择你的 GitHub 仓库
   - 如果项目还没放到 GitHub，先把这个项目上传到 GitHub

3. 填构建和启动命令

```bash
npm install && npm run build
```

```bash
npm run start:render
```

4. 添加环境变量

```env
WECHAT_TOKEN=lmtmaggie666
DATA_DIR=/var/data
LIFE_OS_API_BASE=
```

5. 添加 Disk
   - Mount Path: `/var/data`
   - Size: 1 GB 即可

6. 部署完成后，你会拿到类似这样的地址：

```text
https://your-app.onrender.com
```

公众号后台的 URL 填：

```text
https://your-app.onrender.com/api/wechat/callback
```

## 微信后台填写

- URL：`https://你的固定域名/api/wechat/callback`
- Token：`lmtmaggie666`
- 消息加密：明文模式
- 数据格式：XML

## 注意

当前项目还在用 JSON 文件存储，所以必须配置 `DATA_DIR=/var/data` 并挂载 Disk。
如果不用持久磁盘，服务重新部署后数据可能丢失。

`LIFE_OS_API_BASE` 是可选项：

- 不填：直接使用站点内置的记账 / 待办 / 日程引擎，适合直接部署到 Render。
- 填公网地址：例如 `https://your-life-os.example.com`，站点会优先代理到这个外部后端；如果外部后端临时不可用，会回退到站点本地存储。
