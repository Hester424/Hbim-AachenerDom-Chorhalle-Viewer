@echo off
REM GitHub Pages 部署脚本 (Windows)

echo 🚀 开始部署到 GitHub Pages...

REM 1. 构建项目
echo 📦 构建项目...
call npm run build

REM 2. 进入构建目录
cd dist

REM 3. 初始化 git (如果还没有)
if not exist .git (
  git init
  git checkout -b gh-pages
)

REM 4. 添加所有文件
git add -A

REM 5. 提交
git commit -m "Deploy to GitHub Pages - %date% %time%"

REM 6. 推送到 GitHub Pages 分支
REM ⚠️ 替换成你的仓库地址
git push -f https://github.com/Hester424/Hbim-AachenerDom-Chorhalle-Viewer.git gh-pages

echo ✅ 部署完成！
echo 🌐 访问: https://Hester424.github.io/Hbim-AachenerDom-Chorhalle-Viewer/

cd ..
pause
