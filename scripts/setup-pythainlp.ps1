$ErrorActionPreference = "Stop"

$scriptsDir = $PSScriptRoot
$venvDir = Join-Path $scriptsDir ".venv-pythainlp"
$pythonPath = Join-Path $venvDir "Scripts\python.exe"
$requirementsPath = Join-Path $scriptsDir "requirements-pythainlp.txt"

if (-not (Test-Path -LiteralPath $pythonPath)) {
    $basePython = if ($env:PYTHON_EXECUTABLE) { $env:PYTHON_EXECUTABLE } elseif ($env:PYTHON) { $env:PYTHON } else { "python" }
    & $basePython -m venv $venvDir
    if ($LASTEXITCODE -ne 0) { throw "Failed to create Python virtual environment" }
}

& $pythonPath -m pip install -r $requirementsPath
if ($LASTEXITCODE -ne 0) { throw "Failed to install PyThaiNLP" }

& $pythonPath -c "import pythainlp; from pythainlp.tokenize import subword_tokenize; text = '\u0e20\u0e32\u0e29\u0e32\u0e44\u0e17\u0e22'; assert ''.join(subword_tokenize(text, engine='tcc')) == text; print('PyThaiNLP', pythainlp.__version__, 'Thai tokenizer ready')"
if ($LASTEXITCODE -ne 0) { throw "PyThaiNLP verification failed" }
Write-Output "Ready: $pythonPath"
