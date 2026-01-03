# 四国军棋 Q-Learning 训练 - Google Colab 版本

## 🚀 快速开始

在 Google Colab 中运行以下步骤来训练 AI：

### Step 1: 安装 Node.js

```python
# 安装 Node.js
!curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
!sudo apt-get install -y nodejs
!node --version
!npm --version
```

### Step 2: 克隆项目 (如果已上传则跳过)

**方法A: 从GitHub克隆** (如果您有GitHub仓库)
```python
!git clone https://github.com/YOUR_USERNAME/junqi2.git
%cd junqi2
```

**方法B: 上传ZIP** (推荐)
1. 将项目打包成ZIP
2. 上传到Colab
3. 解压:
```python
!unzip junqi2.zip
%cd junqi2
```

### Step 3: 安装依赖

```python
!npm install
!npm install -g ts-node typescript
```

### Step 4: 运行训练

```python
# 训练 500 局 (约需 5-10 分钟)
!npx ts-node scripts/train.ts --games 500 --output /content/trained_weights.json
```

### Step 5: 下载训练好的权重

```python
from google.colab import files
files.download('/content/trained_weights.json')
files.download('/content/trained_weights_localStorage.json')
```

---

## 📥 导入权重到游戏

### 方法1: 开发者工具 (推荐)

1. 打开游戏页面
2. 按 `F12` 打开开发者工具
3. 切换到 `Console` 标签
4. 复制 `trained_weights_localStorage.json` 文件的内容
5. 执行:
```javascript
localStorage.setItem('junqi_qlearning_weights', '这里粘贴JSON内容');
```
6. 刷新页面

### 方法2: 通过UI导入 (未来功能)

我们可以添加一个"导入权重"按钮到训练面板。

---

## 🔧 高级选项

### 调整训练参数

编辑 `scripts/train.ts` 中的配置:

```typescript
const manager = new TrainingManager({
    numGames: 1000,        // 训练局数
    useQLearning: true,    // 使用Q-Learning
    trainOnGames: true,    // 边玩边学
    epsilon: 0.2,          // 探索率 (0.1-0.3)
    maxTurnsPerGame: 500,  // 每局最大回合
});
```

### 多次训练累积

权重是累积的！您可以:
1. 训练 500 局
2. 下载权重
3. 导入到游戏
4. 再次训练 500 局
5. 下载更新后的权重

---

## ⚠️ 注意事项

- Colab 免费版有**运行时间限制** (12小时)
- 建议每次训练 **500-2000 局**
- 训练完成后**立即下载权重**，否则断开后会丢失
- 如果断开连接，需要重新安装 Node.js
