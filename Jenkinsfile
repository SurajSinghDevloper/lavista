// LA-VISTA ERP – build, check and deploy with Docker on the Jenkins host.
//
// This Jenkinsfile is the SINGLE place for every secret and runtime setting.
// The pipeline distributes them: to the app container (docker run -e NAME) and to the seed script.
// ⚠ Anyone who can read this repository can read these values – keep the GitHub repo PRIVATE.
//
// Jenkins needs: credential 'GitPat' (Secret text, GitHub token) and NodeJS tool 'NODE_HOME' (Node 20.9+, 24 LTS recommended).

pipeline {
    agent any

    tools {
        nodejs 'NODE_HOME'
    }

    parameters {
        booleanParam(name: 'RUN_SEED', defaultValue: false,
            description: 'Create the admin user (ADMIN_* below) + material catalog + QC templates. Safe to re-run.')
    }

    options {
        disableConcurrentBuilds()
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    environment {
        // ---------------- Deploy settings ----------------
        IMAGE_NAME     = 'lavista'
        CONTAINER_NAME = 'lavista'
        HOST_PORT      = '4044'            // port opened on the server
        APP_PORT       = '4044'            // port inside the container (matches Dockerfile PORT)
        KEEP_IMAGES    = '3'               // older image tags kept for rollback

        // ---------------- Uploads (site photos, drawings, renders, bills) ----------------
        UPLOADS_HOST_DIR = '/var/lib/lavista/uploads' // folder on the server – survives redeploys, back this up
        UPLOAD_DIR       = '/app/storage/uploads'     // same folder as seen inside the container

        // ---------------- Secrets & app config (single source of truth) ----------------
        // Database – URL-encode special characters in the password: ! %21   # %23   @ %40
        MONGODB_URI            = 'mongodb://admin:%21Strong%23Password%402025@204.12.218.208:27017/lavistavivere?authSource=admin&directConnection=true'
        // Auth – min 32 random chars. Changing it logs everyone out.
        JWT_ACCESS_SECRET      = 'YeVqRSczNdrRFtY0xdASfOVUNEGgWxx2XpfhKVk7Q3KM5kaQTlN80FziD8GfMhxu'
        ACCESS_TOKEN_TTL_MIN   = '15'
        REFRESH_TOKEN_TTL_DAYS = '30'
        // URL people open in the browser. When a domain + SSL is ready: APP_URL = 'https://your-domain', COOKIE_SECURE = 'true'
        APP_URL                = 'http://204.12.218.208:4044'
        COOKIE_SECURE          = 'false'   // must stay 'false' while the app is opened on plain http://IP:port
        CORS_ORIGINS           = ''
        // Uploads / misc
        MAX_UPLOAD_MB          = '25'
        APP_TIMEZONE           = 'Asia/Kolkata'
        // Integrations – website enquiry form key, Meta Lead Ads webhook
        LEAD_WEBHOOK_KEY       = 'SHyiB0DJSiOaD2tB1Hc5j-fsSqp77uEM'
        META_VERIFY_TOKEN      = '51e65d54c4ece026760abfce6325710a'
        META_APP_SECRET        = ''
        META_PAGE_ACCESS_TOKEN = ''
        // First admin login – created when the job runs with RUN_SEED
        ADMIN_NAME             = 'LA-VISTA Admin'
        ADMIN_EMAIL            = 'admin@lavista.in'
        ADMIN_PASSWORD         = 'Lv@xKrbHm2miI3L9'
    }

    stages {
        stage('Checkout') {
            steps {
                script {
                    withCredentials([string(credentialsId: 'GitPat', variable: 'GIT_PAT')]) {
                        git url: "https://${GIT_PAT}@github.com/SurajSinghDevloper/lavista.git", branch: 'master'
                    }
                }
            }
        }

        stage('Install & check') {
            steps {
                sh 'npm ci'
                sh 'npx next typegen'
                sh 'npm run typecheck'
                sh 'npm run lint'
            }
        }

        stage('Build image') {
            steps {
                // Secrets are NOT passed to the build – the image contains no credentials.
                sh 'docker build --pull -t ${IMAGE_NAME}:${BUILD_NUMBER} -t ${IMAGE_NAME}:latest .'
            }
        }

        stage('Seed database') {
            when { expression { params.RUN_SEED } }
            steps {
                // reads MONGODB_URI + ADMIN_* from the environment block above
                sh 'npm run seed'
            }
        }

        stage('Deploy') {
            steps {
                // "-e NAME" (without =value) copies the value from the environment block,
                // so secrets are never printed in the console log.
                sh '''
                    # Upload folder on the server, writable by the app user (uid 1001) inside the container.
                    # Done through a throw-away container so Jenkins needs no sudo.
                    docker run --rm -v "$(dirname ${UPLOADS_HOST_DIR})":/host alpine:3 sh -c \
                      "mkdir -p /host/$(basename ${UPLOADS_HOST_DIR}) && chown -R 1001:1001 /host/$(basename ${UPLOADS_HOST_DIR})"
                    # One-time move of files from the old named volume (earlier pipeline version); harmless if repeated.
                    if docker volume inspect lavista-uploads > /dev/null 2>&1; then
                      docker run --rm -v lavista-uploads:/from -v ${UPLOADS_HOST_DIR}:/to alpine:3 sh -c \
                        "cp -an /from/. /to/ 2>/dev/null; chown -R 1001:1001 /to" || true
                    fi

                    docker stop ${CONTAINER_NAME} || true
                    docker rm ${CONTAINER_NAME} || true
                    docker run -d --name ${CONTAINER_NAME} \
                      -p ${HOST_PORT}:${APP_PORT} \
                      -e NODE_ENV=production \
                      -e PORT=${APP_PORT} \
                      -e HOSTNAME=0.0.0.0 \
                      -e UPLOAD_DIR \
                      -e MONGODB_URI \
                      -e JWT_ACCESS_SECRET \
                      -e ACCESS_TOKEN_TTL_MIN \
                      -e REFRESH_TOKEN_TTL_DAYS \
                      -e APP_URL \
                      -e COOKIE_SECURE \
                      -e CORS_ORIGINS \
                      -e MAX_UPLOAD_MB \
                      -e APP_TIMEZONE \
                      -e LEAD_WEBHOOK_KEY \
                      -e META_VERIFY_TOKEN \
                      -e META_APP_SECRET \
                      -e META_PAGE_ACCESS_TOKEN \
                      -v ${UPLOADS_HOST_DIR}:${UPLOAD_DIR} \
                      --add-host=host.docker.internal:host-gateway \
                      --restart unless-stopped \
                      ${IMAGE_NAME}:${BUILD_NUMBER}
                '''
            }
        }

        stage('Health check') {
            steps {
                // Checked from inside the container so it works whether Jenkins runs on the host or in Docker.
                sh '''
                    for i in $(seq 1 30); do
                      if docker exec ${CONTAINER_NAME} wget -qO- http://127.0.0.1:${APP_PORT}/api/v1/health; then
                        echo; echo "Healthy"; exit 0
                      fi
                      sleep 3
                    done
                    echo "LA-VISTA did not become healthy (is MongoDB reachable from the container?)"
                    docker logs --tail 100 ${CONTAINER_NAME}
                    exit 1
                '''
            }
        }
    }

    post {
        success {
            sh '''
                docker images ${IMAGE_NAME} --format '{{.Tag}}' | grep -E '^[0-9]+$' | sort -rn \
                  | tail -n +$((KEEP_IMAGES + 1)) | xargs -r -I{} docker rmi ${IMAGE_NAME}:{} || true
                docker image prune -f || true
            '''
            echo "LA-VISTA ERP deployed – build ${env.BUILD_NUMBER} running on port ${env.HOST_PORT}"
        }
        failure {
            echo 'LA-VISTA ERP pipeline failed – check the stage logs above'
        }
    }
}
