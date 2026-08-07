# Linux Conda 完整安装与使用手册
## 一、下载安装 Miniconda（推荐，轻量）
### 1. 下载安装脚本
打开 Linux 终端，根据系统架构下载：
#### x86_64（绝大多数服务器/电脑）
```bash
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
```
#### ARM64（树莓派、鲲鹏、M系列Mac Linux虚拟机）
```bash
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-aarch64.sh
```

### 2. 执行安装
```bash
bash Miniconda3-latest-Linux-x86_64.sh
```
操作步骤：
1. 回车阅读协议，输入 `yes` 同意
2. 选择安装路径（默认 `~/miniconda3`，直接回车即可；自定义输入路径）
3. **是否初始化shell？输入 yes**（自动写入 ~/.bashrc）

### 3. 生效环境变量
```bash
source ~/.bashrc
# zsh 用户执行 source ~/.zshrc
```
### 4. 验证安装
```bash
conda --version
# 输出版本号即成功
```

### 可选：换国内清华源（解决下载慢）
```bash
conda config --add channels https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/free/
conda config --add channels https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main/
conda config --set show_channel_urls yes
```

## 二、Conda 基础环境管理（核心命令）
### 1. 创建虚拟环境
格式：`conda create -n 环境名 python=版本`
```bash
# 创建名为 py310、python3.10 的环境
conda create -n py310 python=3.10
# 输入 y 确认安装依赖包
```

### 2. 查看所有环境
```bash
conda env list
# 或
conda info --envs
# * 代表当前激活的环境
```

### 3. 激活/进入环境
```bash
conda activate py310
# 激活后终端前缀会显示 (py310)
# 查看当前python版本
python --version
```

### 4. 退出当前环境
```bash
conda deactivate
```

### 5. 删除无用环境
```bash
# 先退出环境再删除
conda remove -n py310 --all
# 输入 y 彻底删除整个环境
```

### 6. 环境复制（克隆）
```bash
conda create -n py310-new --clone py310
```

## 三、环境内包管理（安装/卸载/导出）
### 1. 安装第三方包
```bash
# conda 安装（优先）
conda install numpy pandas torch
# pip 安装（conda无包时使用）
pip install xxx
```

### 2. 卸载包
```bash
conda remove numpy
pip uninstall xxx
```

### 3. 导出环境配置（迁移服务器必备）
#### 方式1：跨系统通用（推荐）
```bash
conda activate py310
# 导出yaml文件
conda env export > environment.yml
```
#### 在另一台Linux导入环境
```bash
conda env create -f environment.yml
```

#### 方式2：仅导出pip包列表
```bash
pip freeze > requirements.txt
pip install -r requirements.txt
```

### 4. 更新conda/所有包
```bash
# 更新conda本体
conda update conda
# 更新当前环境全部包
conda update --all
```

## 四、常用避坑配置
### 1. 关闭自动激活base环境（很多人不需要）
安装后每次打开终端自动进入(base)，关闭：
```bash
conda config --set auto_activate_base false
# 想恢复开启：true
```

### 2. conda命令找不到（初始化失败修复）
如果执行 `conda: command not found`
```bash
# 手动初始化bash
~/miniconda3/bin/conda init bash
source ~/.bashrc
```

### 3. 清理conda缓存（释放磁盘）
conda下载包会缓存，占用大量空间
```bash
conda clean -i  # 删除索引缓存
conda clean -p  # 删除无用安装包
conda clean -t  # 删除未使用的压缩包
# 一键全部清理
conda clean -y --all
```

## 五、离线环境迁移（无外网Linux服务器）
1. 能上网机器导出yaml
2. 下载对应安装包缓存：
```bash
conda pack -n py310
# 生成 py310.tar.gz 压缩包
```
3. 传到离线服务器，解压：
```bash
mkdir -p ~/miniconda3/envs/
tar -xzf py310.tar.gz -C ~/miniconda3/envs/
# 修复环境路径
source ~/miniconda3/envs/py310/bin/activate
conda-unpack
```

## 六、完整使用流程示例
```bash
# 1. 创建环境
conda create -n ml python=3.9
# 2. 激活
conda activate ml
# 3. 安装深度学习依赖
conda install pytorch torchvision cpuonly -c pytorch
conda install scikit-learn matplotlib
# 4. 导出环境
conda env export > ml_env.yml
# 5. 退出
conda deactivate
```

## 补充：Anaconda vs Miniconda
- Miniconda：仅conda+python基础，体积小，**推荐服务器使用**
- Anaconda：预装几百个数据分析包，体积巨大，本地电脑可用

---
### 使用说明
1. 复制上面全部内容
2. 新建文件：`vim Linux_Conda使用手册.md`
3. 粘贴内容，保存退出即可