$ErrorActionPreference = "Stop"

$scriptsDir = $PSScriptRoot
$venvDir = Join-Path $scriptsDir ".venv-derived-image"
$pythonPath = Join-Path $venvDir "Scripts\python.exe"
$requirementsPath = Join-Path $scriptsDir "requirements-derived-image.txt"
$modelPath = Join-Path $scriptsDir "models\EDSR_x4.pb"
$expectedModelHash = "dd35ce3cae53ecee2d16045e08a932c3e7242d641bb65cb971d123e06904347f"

if (-not (Test-Path -LiteralPath $pythonPath)) {
    $basePython = if ($env:PYTHON_EXECUTABLE) { $env:PYTHON_EXECUTABLE } elseif ($env:PYTHON) { $env:PYTHON } else { "python" }
    & $basePython -m venv $venvDir
    if ($LASTEXITCODE -ne 0) { throw "สร้าง Python virtual environment ไม่สำเร็จ" }
}

& $pythonPath -m pip install -r $requirementsPath
if ($LASTEXITCODE -ne 0) { throw "ติดตั้ง derived-image dependencies ไม่สำเร็จ" }

if (-not (Test-Path -LiteralPath $modelPath)) { throw "ไม่พบ EDSR model: $modelPath" }
$actualModelHash = (Get-FileHash -LiteralPath $modelPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualModelHash -ne $expectedModelHash) { throw "EDSR model SHA-256 ไม่ตรงกับค่าที่ pin ไว้" }

& $pythonPath -c "import cv2; assert hasattr(cv2, 'dnn_superres'); print('OpenCV', cv2.__version__, 'dnn_superres ready')"
if ($LASTEXITCODE -ne 0) { throw "OpenCV dnn_superres ยังไม่พร้อม" }
Write-Output "พร้อมใช้งาน: $pythonPath"
