---
name: mac-ai-notify
description: 在 macOS 上运行长时间 AI 任务（训练、推理、微调等）结束后，自动发送 macOS 原生系统通知（右上角横幅 + 声音）。支持区分成功与失败，适用于任何 shell 和任何终端。
version: "1.2"
tags:
  - notification
  - macos
  - ai-training
  - shell
  - terminal
---

# macOS AI 任务完成通知技能 (mac-ai-notify)

## 技能描述

使用 macOS 自带的 `osascript` 命令，在 AI 任务结束后弹出**原生系统通知**。通知会在屏幕右上角以横幅形式出现，并可播放提示音，支持成功和失败区分。

## 适用场景

- 长时间的 AI 模型训练、推理、数据处理、批量任务等
- 需要切换到其他窗口或应用后，仍能及时收到任务完成提醒
- 希望清晰区分任务是成功还是失败

---

## 使用方法（通用写法，适用于任何 shell）

### 基础用法

```bash
# 只在成功时通知（推荐）
your_ai_command && osascript -e 'display notification "任务已完成" with title "✅ AI 完成" sound name "Glass"'

# 不管成功失败都通知（长训练推荐）
your_ai_command; osascript -e 'display notification "任务已完成" with title "✅ AI 完成" sound name "Glass"'
```

### 推荐写法（带任务名称）

```bash
# 示例 1：微调任务
python train.py; osascript -e 'display notification "所有 epoch 已完成" with title "✅ Llama3 微调 完成" sound name "Glass"'

# 示例 2：推理任务
./run_inference.sh; osascript -e 'display notification "10000 个样本处理完毕" with title "✅ DeepSeek 推理 完成" sound name "Glass"'

# 示例 3：预训练任务
python long_training.py; osascript -e 'display notification "训练结束" with title "✅ Qwen2 预训练 完成" sound name "Glass"'
```

### 区分成功与失败通知（完整写法）

```bash
your_ai_command; \
if [ $? -eq 0 ]; then \
    osascript -e 'display notification "任务成功完成" with title "✅ AI 任务 完成" sound name "Glass"'; \
else \
    osascript -e 'display notification "任务执行失败" with title "❌ AI 任务 失败" sound name "Basso"'; \
fi
```

---

## 首次使用权限引导（必须操作一次）

macOS 会将通知归属于 Script Editor（脚本编辑器），需要手动开启权限。

### 操作步骤

1. **运行测试命令**（会触发权限请求）：

   ```bash
   osascript -e 'display notification "测试通知 - 请检查右上角" with title "AI 通知测试" sound name "Glass"'
   ```

2. **点击弹出的权限窗口中的「允许」（Allow）**

3. **打开系统设置 → 通知，找到左侧的「Script Editor」**，设置以下选项：
   - ✅ 开启「允许通知」
   - ✅ 通知样式选择「横幅」（Banners）
   - ✅ 可开启声音

4. **关闭专注模式（Focus）或勿扰模式**（如果已开启）

完成以上步骤后，通知即可正常在右上角弹出。

---

## 常用提示音

| 提示音名称 | 适用场景 |
|-----------|---------|
| Glass | 成功、轻快提示（推荐） |
| Basso | 失败、错误提示 |
| Pop | 常规通知 |
| Ping | 轻柔提示 |

