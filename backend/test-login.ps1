$body = '{"email":"admin@test.com","password":"admin123"}'
$response = Invoke-RestMethod -Uri "http://localhost:4000/auth/login" -Method POST -Headers @{"Content-Type"="application/json"} -Body $body
Write-Output ($response | ConvertTo-Json -Depth 10)
