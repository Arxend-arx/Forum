# 轻量论坛系统部署文档

## 1. 文档目的

本文档用于指导轻量论坛系统在本地环境中的安装、启动、验证与日常维护。当前项目基于：

- Python
- Flask
- SQLite3

系统定位为本地轻量论坛，适合教学演示、功能验证与小规模个人使用。

## 2. 部署范围

当前文档覆盖以下内容：

- 运行环境准备
- 项目目录说明
- 依赖安装
- conda 环境部署
- 启动方式
- 后台运行方式
- 数据库初始化机制
- 功能验证步骤
- 常见问题处理

当前版本不包含：

- Docker 部署
- Nginx 反向代理
- 生产级 WSGI 服务部署
- 外部数据库部署

## 3. 运行环境要求

| 项目 | 要求 |
| --- | --- |
| 操作系统 | Windows / Linux / macOS |
| Python 版本 | 3.8 及以上 |
| 依赖库 | `flask==2.3.3` |
| 数据库 | SQLite，本地文件方式 |
| 网络要求 | 本地访问即可 |

## 4. 项目目录说明

建议目录结构如下：

```text
forum_project/
├── app.py
├── forum.db
├── database_design.md
├── deployment_guide.md
└── templates/
    ├── base.html
    ├── index.html
    ├── login.html
    ├── register.html
    ├── create_post.html
    └── post_detail.html
```

说明：

- `app.py`：后端主程序，负责路由、数据库初始化、业务逻辑处理
- `forum.db`：SQLite 数据库文件，首次运行自动生成
- `templates/`：Jinja2 模板目录
- `database_design.md`：数据库设计文档
- `deployment_guide.md`：当前部署文档

## 5. 部署前准备

### 5.1 检查 Python

执行以下命令确认 Python 已安装：

```bash
python --version
```

如果输出版本号且版本不低于 3.8，则环境满足要求。

### 5.2 进入项目目录

```bash
cd d:\research\forum\forum_project
```

Windows PowerShell 也可直接在该目录打开终端执行。

## 6. 安装依赖

本项目仅依赖 Flask：

```bash
pip install flask==2.3.3
```

如果使用虚拟环境，建议先创建并激活虚拟环境后再安装：

### Windows

```bash
python -m venv .venv
.venv\Scripts\activate
pip install flask==2.3.3
```

### Linux / macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install flask==2.3.3
```

### 6.1 conda 环境部署

如果本机主要使用 Anaconda 或 Miniconda，推荐使用独立 conda 环境部署：

#### 创建环境

```bash
conda create -n forum_env python=3.10 -y
```

#### 激活环境

```bash
conda activate forum_env
```

#### 安装依赖

```bash
pip install flask==2.3.3
```

#### 验证环境

```bash
python --version
pip show flask
```

建议后续每次启动项目时，都先执行：

```bash
conda activate forum_env
```

## 7. 启动方式

### 7.1 直接运行

在项目根目录执行：

```bash
python app.py
```

默认启动后会看到类似输出：

```text
* Running on http://127.0.0.1:5000
```

浏览器访问：

```text
http://127.0.0.1:5000
```

### 7.2 后台运行模式

如果希望关闭终端后程序仍保持运行，可以使用后台运行方式。

#### Windows PowerShell 后台运行

在项目目录执行：

```powershell
Start-Process python -ArgumentList "app.py" -WorkingDirectory "d:\research\forum\forum_project"
```

如果希望同时写入日志：

```powershell
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'd:\research\forum\forum_project'; python app.py *> forum.log"
```

说明：

- 第一种方式适合快速后台启动
- 第二种方式适合保留运行日志
- 如需结束进程，可在任务管理器中结束对应 `python.exe`

#### Linux / macOS 后台运行

```bash
nohup python app.py > forum.log 2>&1 &
```

查看进程：

```bash
ps -ef | grep app.py
```

停止进程：

```bash
pkill -f "python app.py"
```

说明：

- 日志会写入 `forum.log`
- 关闭终端后服务仍可继续运行

### 7.3 conda 环境下启动

如果使用 conda 环境，完整启动流程如下：

```bash
conda activate forum_env
cd d:\research\forum\forum_project
python app.py
```

如需 conda 环境下后台运行：

#### Windows PowerShell

```powershell
conda activate forum_env
Start-Process python -ArgumentList "app.py" -WorkingDirectory "d:\research\forum\forum_project"
```

#### Linux / macOS

```bash
conda activate forum_env
cd /path/to/forum_project
nohup python app.py > forum.log 2>&1 &
```

### 7.4 环境变量方式设置密钥

虽然项目已提供默认 `SECRET_KEY`，但在实际部署时建议手动设置：

#### Windows PowerShell

```powershell
$env:SECRET_KEY="your-own-secret-key"
python app.py
```

#### Linux / macOS

```bash
export SECRET_KEY="your-own-secret-key"
python app.py
```

## 8. 数据库初始化机制

系统在应用启动时自动执行 `init_db()`，完成以下操作：

1. 创建 `user` 表
2. 创建 `post` 表
3. 创建 `comment` 表
4. 启用 SQLite 外键约束

如果当前目录不存在 `forum.db`，系统会自动生成数据库文件。

如果数据库文件已存在，则只会执行 `CREATE TABLE IF NOT EXISTS`，不会覆盖已有数据。

## 9. 首次部署验证流程

部署完成后，建议按以下步骤验证：

1. 打开首页，确认页面可访问
2. 注册一个测试账号
3. 用测试账号登录
4. 发布一篇测试帖子
5. 进入帖子详情页并发表评论
6. 删除评论
7. 删除帖子
8. 退出登录
9. 未登录状态下验证发帖和评论会被拦截

通过以上流程，可确认以下模块正常：

- 用户模块
- 帖子模块
- 评论模块
- Session 登录态
- 权限控制
- 级联删除

## 10. 常见运维操作

### 10.1 重置数据库

如果是本地测试环境，需要清空历史数据，可删除数据库文件后重新启动：

```bash
del forum.db
python app.py
```

Linux / macOS：

```bash
rm forum.db
python app.py
```

说明：

- 删除后原有用户、帖子、评论数据都会丢失
- 重启应用后会自动重新建表

### 10.2 修改监听地址

当前 `app.py` 默认使用 Flask 开发服务器默认配置。如需局域网访问，可将启动部分改为：

```python
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
```

仅建议在内网开发测试环境中使用。

### 10.3 关闭调试模式

如果希望减少调试信息暴露，可将：

```python
app.run(debug=True)
```

调整为：

```python
app.run(debug=False)
```

### 10.4 后台运行日志查看

如果使用后台运行模式，建议定期查看日志文件：

#### Windows PowerShell

```powershell
Get-Content .\forum.log -Wait
```

#### Linux / macOS

```bash
tail -f forum.log
```

### 10.5 conda 环境查看

查看当前 conda 环境列表：

```bash
conda env list
```

删除测试用 conda 环境：

```bash
conda remove -n forum_env --all -y
```

## 11. 常见问题处理

### 11.1 启动时报错 `No module named flask`

原因：

- Flask 未安装
- 虚拟环境未激活

处理方式：

```bash
pip install flask==2.3.3
```

### 11.2 页面能打开但样式异常

原因：

- 模板文件缺失
- `templates/` 目录结构不正确

处理方式：

- 确认 `templates/` 与 `app.py` 在同级目录
- 确认 6 个 HTML 模板文件完整存在

### 11.3 删除帖子后评论未删除

原因通常有两类：

- SQLite 外键约束未开启
- 数据库表结构不是应用当前版本自动初始化生成的

处理方式：

- 保证数据库连接执行 `PRAGMA foreign_keys = ON`
- 删除旧 `forum.db` 后重启应用重新初始化

### 11.4 数据库文件无法创建

可能原因：

- 当前目录无写权限
- 路径错误

处理方式：

- 确认当前用户对 `forum_project/` 目录有写权限
- 确认在正确目录启动 `app.py`

### 11.5 conda 命令不可用

可能原因：

- 未安装 Conda
- 当前终端未初始化 conda

处理方式：

- 确认已安装 Anaconda 或 Miniconda
- 执行 `conda init powershell` 或对应 shell 初始化命令
- 关闭并重新打开终端后再次执行 `conda activate forum_env`

### 11.6 后台运行后无法访问页面

可能原因：

- 进程未真正启动
- 启动目录不正确
- 日志中有依赖或端口占用错误

处理方式：

- 查看 `forum.log`
- 检查是否已有其他程序占用 5000 端口
- 在前台执行一次 `python app.py`，先确认程序可正常启动

## 12. 安全说明

当前版本为基础教学部署版本，具有以下限制：

- 使用 Flask 自带开发服务器，不适合高并发生产环境
- 密码未加密存储
- 未启用 CSRF 防护
- 未启用 Session 超时控制

因此建议使用场景为：

- 本地学习
- 课堂演示
- 小范围功能验证

不建议直接用于互联网公开生产环境。

## 13. 发布检查清单

部署前可按以下清单检查：

- Python 版本符合要求
- Flask 已安装
- conda 环境已激活（如使用 conda）
- 项目目录完整
- `app.py` 可正常运行
- 后台运行命令验证通过（如需长期运行）
- `templates/` 文件完整
- 首页可访问
- 注册/登录正常
- 发帖/评论正常
- 删除权限正常
- 级联删除正常

## 14. 文档维护建议

当项目发生以下变化时，应同步更新本部署文档：

- 启动命令变化
- 依赖版本变化
- 数据库结构变化
- 新增环境变量
- 新增部署方式

这样可以保证开发、测试、演示阶段使用同一份准确文档。
