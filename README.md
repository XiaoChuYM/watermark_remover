# 水印消消乐

一个纯前端的图片去水印静态站。

功能特点：

- 支持点击或拖拽上传图片
- 支持在图片上直接涂抹需要去除的区域
- 支持浏览器本地处理
- 支持处理后预览和下载结果

## 本地预览

直接打开 `index.html` 即可。

如果你希望通过本地静态服务访问：

```bash
cd /Users/zerozero/Desktop/IOPaint
python3 -m http.server 8010
```

然后在浏览器打开：

```text
http://127.0.0.1:8010/index.html
```

## 项目结构

```text
.
├── index.html
├── app.js
├── styles.css
├── README.md
└── GITHUB_PAGES.md
```

## GitHub Pages 发布

1. 在 GitHub 创建新仓库
2. 把当前目录代码推送到 `main` 分支
3. 进入仓库 `Settings -> Pages`
4. 在 `Build and deployment` 中选择：
   - `Source`: `Deploy from a branch`
   - `Branch`: `main`
   - `Folder`: `/ (root)`
5. 保存后等待 GitHub 自动部署

部署后的地址通常为：

```text
https://你的用户名.github.io/仓库名/
```

## 注意事项

- 当前版本更适合小面积文字、角落 logo 等简单水印场景
- 对复杂纹理、大面积半透明水印，效果会有限
- 图片处理在浏览器本地完成，不上传到服务器
