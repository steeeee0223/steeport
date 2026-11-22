# 雷歐的三個姿勢

三個模型都直接使用 [Leo 模型開發記錄](../../models/cat-archives/index.html) 中的網格。站姿用 Cat base mesh，步態用 Cat Curious Pose，伸懶腰用 Stretching cat。匯入後以公尺對齊地面與前方，細分站姿表面供上色，再簡化三組網格。跨步網格先焊接重疊頂點，再減面。各模型有自己的拓撲和形變鍵。咖啡廳以淡入淡出銜接，步態由移動距離帶動。

[調查照片與影片影格](../../content/books/leo/02-model-references.md)是上色依據。正臉 0194 和斜臉 0313 用來核對橄欖金色虹膜、磚粉色鼻子、額頭深紋與淡色下巴。站姿、俯視和後方影格用來核對深橘色虎斑與尾環。前掌照片 0759 顯示橘腳和粉褐肉墊。遮住的毛紋依相鄰可見區域延伸。跨步模型原有的色圖提供臉部和條紋細節，腳上的白色已改為橘色。三個模型原有的臉型和姿勢輪廓仍可分辨。

## 重新匯出

準備開發記錄列出的三個模型，以及跨步模型的色圖。把範例中的 `path/to/leo-sources/` 換成解壓縮後的目錄，再從專案根目錄用 Blender 5.2 LTS 執行。

```sh
blender -b --factory-startup --disable-autoexec --python-exit-code 1 --python scene/leo/build.py -- \
  --stand 'path/to/leo-sources/Cat+base+mesh.blend' \
  --step 'path/to/leo-sources/120_Cat Curious Pose.blend' \
  --stretch 'path/to/leo-sources/cat_fbx/cat.fbx' \
  --atlas 'path/to/leo-sources/textures/material_0_baseColor.png'
```

`public/models/leo.blend` 的場景選單可切換 Standing、Walking 和 Stretching，每個場景都可在時間軸播放。三個場景共用 `Preview studio` 集合。模型頁面和咖啡廳共用 `public/models/leo.glbz`。

用 `--output` 把測試匯出存到另一個目錄，用 `--render-dir` 另存各姿勢的檢視圖。更新模型後，在模型頁播放三個姿勢，再到咖啡廳看雷歐起身、走路和被摸背時的動作。[在瀏覽器驗證](../../README.md#verify-changes)
