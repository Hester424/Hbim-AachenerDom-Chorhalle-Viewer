@echo off
REM GitHub Pages Deploy Script (Windows)

echo Start deploying to GitHub Pages...

REM 1. Build project
echo Building project...
call npm run build

REM 2. Enter build directory
cd dist

REM 3. Initialize git (if not exists)
if not exist .git (
  git init
  git checkout -b gh-pages
)

REM 4. Add all files
git add -A

REM 5. Commit
git commit -m "Deploy to GitHub Pages - %date% %time%"

REM 6. Push to GitHub Pages branch
REM Replace with your repository URL
git push -f https://github.com/Hester424/Hbim-AachenerDom-Chorhalle-Viewer.git gh-pages

echo Deployment complete!
echo Visit: https://Hester424.github.io/Hbim-AachenerDom-Chorhalle-Viewer/

cd ..
pause