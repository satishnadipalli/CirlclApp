# Deployment Guide

## Overview

This guide covers the complete deployment process for the social media application, including both backend and frontend components.

## Prerequisites

### Required Accounts
- **MongoDB Atlas** (or self-hosted MongoDB)
- **Cloudinary** (for media storage)
- **Expo** (for mobile app deployment)
- **Vercel/Netlify** (for web deployment, optional)

### Required Tools
- Node.js 18+
- Git
- PM2 (for production process management)
- Nginx (for reverse proxy, optional)

## Backend Deployment

### 1. Environment Setup

#### Production Environment Variables
Create a `.env` file in the Backend directory:

```env
# Server Configuration
NODE_ENV=production
PORT=5000

# Database
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/social_app?retryWrites=true&w=majority

# JWT
JWT_SECRET=your_very_secure_jwt_secret_key_here

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# CORS (for production)
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

#### Security Considerations
- Use a strong, unique JWT secret (32+ characters)
- Enable MongoDB Atlas network access restrictions
- Use environment-specific Cloudinary folders
- Set up proper CORS origins for production

### 2. Server Setup

#### Ubuntu/Debian Server Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install Nginx (optional, for reverse proxy)
sudo apt install nginx -y

# Create application directory
sudo mkdir -p /var/www/social-app
sudo chown $USER:$USER /var/www/social-app
```

#### CentOS/RHEL Server Setup
```bash
# Update system
sudo yum update -y

# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install Nginx (optional)
sudo yum install nginx -y

# Create application directory
sudo mkdir -p /var/www/social-app
sudo chown $USER:$USER /var/www/social-app
```

### 3. Application Deployment

#### Clone and Setup
```bash
# Navigate to application directory
cd /var/www/social-app

# Clone repository
git clone https://github.com/yourusername/social-app.git .

# Install dependencies
npm install --production

# Create environment file
cp .env.example .env
# Edit .env with production values
nano .env
```

#### PM2 Configuration
Create `ecosystem.config.js` in the Backend directory:

```javascript
module.exports = {
  apps: [{
    name: 'social-app-backend',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 5000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
```

#### Start Application
```bash
# Create logs directory
mkdir -p logs

# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
# Follow the instructions provided by the command above
```

### 4. Nginx Configuration (Optional)

#### Reverse Proxy Setup
Create `/etc/nginx/sites-available/social-app`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL Configuration
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    # API routes
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Socket.IO support
    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files (if any)
    location / {
        root /var/www/social-app/public;
        try_files $uri $uri/ =404;
    }
}
```

#### Enable Site
```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/social-app /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### 5. SSL Certificate Setup

#### Let's Encrypt (Recommended)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtain certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### 6. Database Setup

#### MongoDB Atlas Configuration
1. Create a MongoDB Atlas cluster
2. Configure network access (IP whitelist)
3. Create database user with appropriate permissions
4. Get connection string and update `.env`

#### Local MongoDB Setup (Alternative)
```bash
# Install MongoDB
sudo apt install mongodb -y

# Start MongoDB service
sudo systemctl start mongodb
sudo systemctl enable mongodb

# Create database and user
mongo
use social_app
db.createUser({
  user: "appuser",
  pwd: "securepassword",
  roles: ["readWrite"]
})
```

### 7. Monitoring and Logs

#### PM2 Monitoring
```bash
# Monitor application
pm2 monit

# View logs
pm2 logs social-app-backend

# View specific log files
tail -f logs/combined.log
```

#### System Monitoring
```bash
# Install monitoring tools
sudo apt install htop iotop -y

# Monitor system resources
htop
iotop
```

## Frontend Deployment

### 1. Expo Configuration

#### App Configuration
Update `app.json` in the Frontend directory:

```json
{
  "expo": {
    "name": "Social App",
    "slug": "social-app",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.yourcompany.socialapp"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#FFFFFF"
      },
      "package": "com.yourcompany.socialapp"
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "extra": {
      "eas": {
        "projectId": "your-project-id"
      }
    },
    "plugins": [
      "expo-router",
      "expo-camera",
      "expo-location",
      "expo-notifications"
    ]
  }
}
```

#### Environment Configuration
Create `constants/Config.ts`:

```typescript
const ENV = {
  development: {
    API_BASE_URL: 'http://localhost:5000/api',
    API_ORIGIN: 'http://localhost:5000',
  },
  production: {
    API_BASE_URL: 'https://yourdomain.com/api',
    API_ORIGIN: 'https://yourdomain.com',
  },
};

const getEnvVars = () => {
  if (__DEV__) {
    return ENV.development;
  }
  return ENV.production;
};

export default getEnvVars();
```

### 2. EAS Build Setup

#### Install EAS CLI
```bash
npm install -g @expo/eas-cli
```

#### Login to Expo
```bash
eas login
```

#### Configure EAS
```bash
eas build:configure
```

#### EAS Configuration
Create `eas.json`:

```json
{
  "cli": {
    "version": ">= 3.13.3"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "android": {
        "buildType": "apk"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

### 3. Build and Deploy

#### Development Build
```bash
# For iOS
eas build --platform ios --profile development

# For Android
eas build --platform android --profile development
```

#### Production Build
```bash
# For iOS
eas build --platform ios --profile production

# For Android
eas build --platform android --profile production
```

#### Submit to App Stores
```bash
# iOS App Store
eas submit --platform ios

# Google Play Store
eas submit --platform android
```

### 4. Web Deployment (Optional)

#### Vercel Deployment
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

#### Netlify Deployment
```bash
# Build for web
npx expo export --platform web

# Deploy to Netlify
# Upload the web-build folder to Netlify
```

## CI/CD Pipeline

### GitHub Actions Setup

#### Backend CI/CD
Create `.github/workflows/backend.yml`:

```yaml
name: Backend CI/CD

on:
  push:
    branches: [ main ]
    paths: [ 'Backend/**' ]
  pull_request:
    branches: [ main ]
    paths: [ 'Backend/**' ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      mongodb:
        image: mongo:6.0
        ports:
          - 27017:27017
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
        cache-dependency-path: Backend/package-lock.json
    
    - name: Install dependencies
      run: |
        cd Backend
        npm ci
    
    - name: Run tests
      run: |
        cd Backend
        npm test
      env:
        MONGO_URI: mongodb://localhost:27017/test
        JWT_SECRET: test-secret
        CLOUDINARY_CLOUD_NAME: test
        CLOUDINARY_API_KEY: test
        CLOUDINARY_API_SECRET: test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - name: Deploy to server
      uses: appleboy/ssh-action@v0.1.5
      with:
        host: ${{ secrets.HOST }}
        username: ${{ secrets.USERNAME }}
        key: ${{ secrets.SSH_KEY }}
        script: |
          cd /var/www/social-app
          git pull origin main
          npm install --production
          pm2 restart social-app-backend
```

#### Frontend CI/CD
Create `.github/workflows/frontend.yml`:

```yaml
name: Frontend CI/CD

on:
  push:
    branches: [ main ]
    paths: [ 'Frontend/**' ]
  pull_request:
    branches: [ main ]
    paths: [ 'Frontend/**' ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
        cache-dependency-path: Frontend/package-lock.json
    
    - name: Install dependencies
      run: |
        cd Frontend
        npm ci
    
    - name: Run linting
      run: |
        cd Frontend
        npm run lint
    
    - name: Run tests
      run: |
        cd Frontend
        npm test

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
        cache-dependency-path: Frontend/package-lock.json
    
    - name: Install dependencies
      run: |
        cd Frontend
        npm ci
    
    - name: Setup EAS
      uses: expo/expo-github-action@v8
      with:
        eas-version: latest
        token: ${{ secrets.EXPO_TOKEN }}
    
    - name: Build Android APK
      run: |
        cd Frontend
        eas build --platform android --profile production --non-interactive
    
    - name: Build iOS
      run: |
        cd Frontend
        eas build --platform ios --profile production --non-interactive
```

## Monitoring and Maintenance

### 1. Application Monitoring

#### PM2 Monitoring
```bash
# Monitor application status
pm2 status

# Monitor resources
pm2 monit

# View logs
pm2 logs

# Restart application
pm2 restart social-app-backend

# Reload application (zero downtime)
pm2 reload social-app-backend
```

#### System Monitoring
```bash
# Monitor system resources
htop
iotop
df -h
free -h

# Monitor network
netstat -tulpn
ss -tulpn
```

### 2. Database Maintenance

#### MongoDB Maintenance
```bash
# Connect to MongoDB
mongo "mongodb://username:password@host:port/database"

# Check database size
db.stats()

# Check collection sizes
db.getCollectionNames().forEach(function(collection) {
  print(collection + ": " + db.getCollection(collection).count());
});

# Create indexes for performance
db.posts.createIndex({ "user": 1, "createdAt": -1 });
db.messages.createIndex({ "from": 1, "to": 1, "createdAt": -1 });
```

#### Backup Strategy
```bash
# Create backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/mongodb"
mkdir -p $BACKUP_DIR

# MongoDB backup
mongodump --uri="mongodb://username:password@host:port/database" --out="$BACKUP_DIR/backup_$DATE"

# Compress backup
tar -czf "$BACKUP_DIR/backup_$DATE.tar.gz" -C "$BACKUP_DIR" "backup_$DATE"

# Remove uncompressed backup
rm -rf "$BACKUP_DIR/backup_$DATE"

# Keep only last 7 days of backups
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +7 -delete
```

### 3. Log Management

#### Log Rotation
Create `/etc/logrotate.d/social-app`:

```
/var/www/social-app/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        pm2 reloadLogs
    endscript
}
```

#### Log Analysis
```bash
# Install log analysis tools
sudo apt install logwatch -y

# Generate daily log report
logwatch --detail High --mailto admin@yourdomain.com
```

### 4. Security Maintenance

#### Regular Updates
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Node.js
sudo npm update -g

# Update PM2
sudo npm update -g pm2

# Update application dependencies
cd /var/www/social-app
npm update
```

#### Security Audits
```bash
# Audit npm packages
npm audit

# Fix security vulnerabilities
npm audit fix

# Update dependencies with security issues
npm update
```

#### SSL Certificate Renewal
```bash
# Test certificate renewal
sudo certbot renew --dry-run

# Manual renewal
sudo certbot renew
```

## Troubleshooting

### Common Issues

#### Application Won't Start
```bash
# Check PM2 status
pm2 status

# Check logs
pm2 logs social-app-backend

# Check environment variables
pm2 env social-app-backend

# Restart application
pm2 restart social-app-backend
```

#### Database Connection Issues
```bash
# Test MongoDB connection
mongo "mongodb://username:password@host:port/database"

# Check MongoDB status
sudo systemctl status mongodb

# Check MongoDB logs
sudo journalctl -u mongodb -f
```

#### Memory Issues
```bash
# Check memory usage
free -h

# Check Node.js memory usage
pm2 monit

# Restart with more memory
pm2 restart social-app-backend --max-memory-restart 2G
```

#### Network Issues
```bash
# Check if port is listening
netstat -tulpn | grep :5000

# Check firewall
sudo ufw status

# Test API endpoint
curl http://localhost:5000/api/health
```

### Performance Optimization

#### Database Optimization
```javascript
// Create indexes for better performance
db.posts.createIndex({ "user": 1, "createdAt": -1 });
db.posts.createIndex({ "hashtags": 1 });
db.posts.createIndex({ "mentions": 1 });
db.posts.createIndex({ "geo": "2dsphere" });
db.messages.createIndex({ "from": 1, "to": 1, "createdAt": -1 });
db.messages.createIndex({ "group": 1, "createdAt": -1 });
```

#### Application Optimization
```javascript
// Enable compression
const compression = require('compression');
app.use(compression());

// Enable caching
app.use(express.static('public', { maxAge: '1d' }));

// Rate limiting
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);
```

This comprehensive deployment guide covers all aspects of deploying the social media application to production, including server setup, application deployment, monitoring, and maintenance.