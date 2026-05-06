Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd C:\Users\nateb\ai-teacher\backend; venv\Scripts\activate; python -m uvicorn app.main:app --reload --port 8000"

Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd C:\Users\nateb\ai-teacher\frontend; npm run dev"

Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd C:\Users\nateb\ai-teacher; claude"

Write-Host "Started 3 windows: backend (port 8000), frontend, and claude code."
