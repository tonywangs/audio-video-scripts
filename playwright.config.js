import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests',workers:1,use:{baseURL:'http://127.0.0.1:18765',headless:true},webServer:{command:'python3 scripts/serve.py',url:'http://127.0.0.1:18765',reuseExistingServer:false}});
