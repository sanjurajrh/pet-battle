pipeline {
	agent {
		label "master"
	}
  environment {
		// GLobal Vars shared across all jenkins agents

		// Job name contains the branch eg pet-battle-feature%2Fjenkins-123
		// ensure the name is k8s compliant
		// JOB_NAME = "${JOB_NAME}".replace("%2F", "-").replace("/", "-")
		// NAME = "${JOB_NAME}".split("/")[0]
		GIT_SSL_NO_VERIFY = true

		// ArgoCD Config Repo
		// set this as an ENV_VAR on Jenkins to make this easier?
    	// ARGOCD_CONFIG_REPO = "github.com/petbattle/ubiquitous-journey.git"
		ARGOCD_CONFIG_REPO_PATH = "pet-battle/test/values.yaml"
        ARGOCD_CONFIG_REPO_BRANCH = "main"

		// Credentials bound in OpenShift
		GIT_CREDS = credentials("${OPENSHIFT_BUILD_NAMESPACE}-git-auth")
		NEXUS_CREDS = credentials("${OPENSHIFT_BUILD_NAMESPACE}-nexus-password")
        SONARQUBE_CREDS = credentials("${OPENSHIFT_BUILD_NAMESPACE}-sonarqube-auth")
        ROX_CREDS = credentials("${OPENSHIFT_BUILD_NAMESPACE}-rox-auth")

		// Nexus Artifact repo
		NEXUS_REPO_NAME="labs-static"
		NEXUS_REPO_HELM = "helm-charts"
	}

	// The options directive is for configuration that applies to the whole job.
	options {
		buildDiscarder(logRotator(numToKeepStr: '50', artifactNumToKeepStr: '1'))
		timeout(time: 15, unit: 'MINUTES')
		ansiColor('xterm')
	}

	stages {
		stage('🗒️ Prepare Environment') {
			failFast true
			parallel {
				stage("📝 Release Build") {
					options {
						skipDefaultCheckout(true)
					}
					agent { label "master" }
					when {
						expression { GIT_BRANCH.startsWith("master") || GIT_BRANCH.startsWith("main") }
					}
					steps {
						script {
							// ensure the name is k8s compliant
							env.TEAM_NAME = "${GITLAB_GROUP_NAME}"
							env.NAME = "${JOB_NAME}".split("/")[0]
							env.APP_NAME = "${NAME}".replace("/", "-").toLowerCase()
							env.DESTINATION_NAMESPACE = "${TEAM_NAME}-test"
							env.IMAGE_NAMESPACE = "${DESTINATION_NAMESPACE}"
							env.IMAGE_REPOSITORY = 'image-registry.openshift-image-registry.svc:5000'
							// env.ARGOCD_CONFIG_REPO = "${ARGOCD_CONFIG_REPO}"
							env.ARGOCD_CONFIG_REPO = "${GITLAB_HOST}/${GITLAB_GROUP_NAME}/tech-exercise.git"
						}
						sh 'printenv'
					}
				}
				stage("📝 Sandbox Build") {
					options {
						skipDefaultCheckout(true)
					}
					agent { label "master" }
					when {
						expression { return !(GIT_BRANCH.startsWith("master") || GIT_BRANCH.startsWith("main") )}
					}
					steps {
						script {
							env.TEAM_NAME = "${TEAM_NAME}"
							env.DESTINATION_NAMESPACE = "${TEAM_NAME}-dev"
							env.IMAGE_NAMESPACE = "${DESTINATION_NAMESPACE}"
							env.IMAGE_REPOSITORY = 'image-registry.openshift-image-registry.svc:5000'

							// ammend the name to create 'sandbox' deploys based on current branch
							env.NAME = "${JOB_NAME}".split("/")[0]
							env.APP_NAME = "${GIT_BRANCH}-${NAME}".replace("/", "-").toLowerCase()
							env.NODE_ENV = "test"
							env.DEV_BUILD = true
						}
					}
				}
			}
		}

        // 💥🔨 PIPELINE EXERCISE GOES HERE
        stage("🧰 Build (Compile App)") {
            agent { label "jenkins-agent-npm" }
			options {
					skipDefaultCheckout(true)
			}
            steps {
			    sh '''
			    git clone ${GIT_URL} pet-battle && cd pet-battle
			    git checkout ${BRANCH_NAME}
			    '''
     			dir('pet-battle'){
                script {
                    env.VERSION = sh(returnStdout: true, script: "npm run version --silent").trim()
                    env.PACKAGE = "${APP_NAME}-${VERSION}.tar.gz"
                }
                sh 'printenv'

                echo '### Install deps ###'
                sh 'npm ci --registry http://nexus:8081/repository/labs-npm'

                // 💅 Lint exercise here
                echo '### Running Linting ###'
                sh 'npm run lint'

                // 🃏 Jest Testing
                echo '### Running Jest Testing ###'
                sh 'npm run test:ci'

                echo '### Running build ###'
                sh 'npm run build '

                // 🌞 SONARQUBE SCANNING EXERCISE GOES HERE 
                echo '### Running SonarQube ###'
                sh '''
                  export SONARQUBE_USERNAME=${SONARQUBE_CREDS_USR}
                  export SONARQUBE_PASSWORD=${SONARQUBE_CREDS_PSW}
                  npm run sonar
                '''

                echo '### Packaging App for Nexus ###'
                sh '''
                    tar -zcvf ${PACKAGE} dist Dockerfile nginx.conf
                    curl -v -f -u ${NEXUS_CREDS} --upload-file ${PACKAGE} \
                        http://nexus:8081/repository/${NEXUS_REPO_NAME}/${APP_NAME}/${PACKAGE}
                '''
								}
            }
            // 📰 Post steps go here
                post {
                    always {
                        dir('pet-battle'){
                        junit 'junit.xml'
                        publishHTML target: [
                            allowMissing: true,
                            alwaysLinkToLastBuild: false,
                            keepAll: false,
                            reportDir: 'reports/lcov-report',
                            reportFiles: 'index.html',
                            reportName: 'Web Code Coverage'
                        ]
                        }
                    }
                }
        }

		stage("🧁 Bake (OpenShift Build)") {
			options {
					skipDefaultCheckout(true)
			}
			agent { label "master" }
			steps {
				sh 'printenv'
				echo '### Get Binary from Nexus and clean up ###'
				sh  '''
					rm -rf package-contents*
					curl -v -f -u ${NEXUS_CREDS} http://nexus:8081/repository/${NEXUS_REPO_NAME}/${APP_NAME}/${PACKAGE} -o ${PACKAGE}
					# clean up
					oc delete bc/${APP_NAME} is/${APP_NAME} || rc=$?
				'''
				echo '### Run OpenShift Build ###'
				sh '''
					echo "🏗 Creating a sandbox build for inside the cluster 🏗"
					BUILD_ARGS=" --build-arg git_commit=${GIT_COMMIT} --build-arg git_url=${GIT_URL}  --build-arg build_url=${RUN_DISPLAY_URL} --build-arg build_tag=${BUILD_TAG} --build-arg JOB_NAME=${JOB_NAME} --build-arg GIT_BRANCH=${GIT_BRANCH} "
					oc new-build --binary --name=${APP_NAME} -l app=${APP_NAME} -l app.kubernetes.io/name=${APP_NAME} ${BUILD_ARGS} --strategy=docker || rc=$?
					oc start-build ${APP_NAME} --from-archive=${PACKAGE} ${BUILD_ARGS} --follow --wait
					oc tag ${OPENSHIFT_BUILD_NAMESPACE}/${APP_NAME}:latest ${DESTINATION_NAMESPACE}/${APP_NAME}:${VERSION}
				'''
			}
		}

		// 📠 IMAGE SCANNING EXAMPLE GOES HERE
        // 📠 IMAGE SCANNING EXAMPLE GOES HERE
        stage("📠 Image Scanning") {
            agent { label "master" }
            steps {
                script {
                    sh '''
                        set +x
                        curl -k -L -H "Authorization: Bearer ${ROX_CREDS_PSW}" https://${ROX_CREDS_USR}/api/cli/download/roxctl-linux --output roxctl  > /dev/null;
                        chmod +x roxctl > /dev/null
                        export ROX_API_TOKEN=${ROX_CREDS_PSW}
                        ./roxctl image scan --insecure-skip-tls-verify -e ${ROX_CREDS_USR}:443 --image image-registry.openshift-image-registry.svc:5000/${DESTINATION_NAMESPACE}/${APP_NAME}:${VERSION} -o table
                    '''

                    // BUILD & DEPLOY CHECKS
                    echo '### Check for Build/Deploy Time Violations ###'
                    }
            }
        }

		stage("🏗️ Deploy - Helm Package") {
			agent { label "jenkins-agent-helm" }
			options {
					skipDefaultCheckout(true)
			}
			steps {
                sh '''
                git clone ${GIT_URL} pet-battle && cd pet-battle
                git checkout ${BRANCH_NAME}
                '''
				dir('pet-battle'){
				echo '### Lint Helm Chart ###'
				sh 'helm lint chart '

				// Kube-linter step
				echo '### Kube Lint ###'       
                sh '''
                  export default_option="do-not-auto-add-defaults"
                  export includelist="no-extensions-v1beta,no-readiness-probe,no-liveness-probe,dangling-service,mismatching-selector,writable-host-mount"
                  kube-linter lint chart/  --"${default_option}" --include "${includelist}" 
                '''         
				echo '### Patch Helm Chart ###'
				script {
						env.CHART_VERSION = sh(returnStdout: true, script: "yq eval .version chart/Chart.yaml").trim()
				}
				sh '''
					# might be overkill...
					yq eval -i .appVersion=\\"${VERSION}\\" "chart/Chart.yaml"

					# over write the chart name for features / sandbox dev
					yq eval -i .name=\\"${APP_NAME}\\" "chart/Chart.yaml"

					# probs point to the image inside ocp cluster or perhaps an external repo?
					yq eval -i .image_repository=\\"${IMAGE_REPOSITORY}\\" "chart/values.yaml"
					yq eval -i .image_name=\\"${APP_NAME}\\" "chart/values.yaml"
					yq eval -i .image_namespace=\\"${IMAGE_NAMESPACE}\\" "chart/values.yaml"

					# latest built image
					yq eval -i .image_version=\\"${VERSION}\\" "chart/values.yaml"
				'''
				echo '### Publish Helm Chart ###'
				sh '''
					# package and release helm chart - could only do this if release candidate only
         			helm package --dependency-update chart/  --app-version ${VERSION}
					curl -v -f -u ${NEXUS_CREDS} http://nexus:8081/repository/${NEXUS_REPO_HELM}/ --upload-file ${APP_NAME}-*.tgz
				'''
				}
			}
		}

		stage("🏗️ Deploy - App") {
			failFast true
			parallel {
				stage("🏖️ Sandbox - Helm Install"){
					options {
						skipDefaultCheckout(true)
					}
					agent { label "jenkins-agent-helm" }
					when {
						expression { return !(GIT_BRANCH.startsWith("master") || GIT_BRANCH.startsWith("main") )}
					}
					steps {
						// TODO - if SANDBOX, create release in rando ns
						sh '''
							helm upgrade --install ${APP_NAME} --set application.fullname=${APP_NAME} \
									--namespace=${DESTINATION_NAMESPACE} \
									http://nexus:8081/repository/${NEXUS_REPO_HELM}/${APP_NAME}-${CHART_VERSION}.tgz
						'''
					}
				}
				stage("🧪 TestEnv - ArgoCD Git Commit") {
					agent { label "jenkins-agent-argocd" }
					options {
						skipDefaultCheckout(true)
					}
					when {
						expression { GIT_BRANCH.startsWith("master") || GIT_BRANCH.startsWith("main") }
					}
					steps {
						echo '### Commit new image tag to git ###'
						sh  '''
							git clone https://${GIT_CREDS}@${ARGOCD_CONFIG_REPO} config-repo
							cd config-repo
							git checkout ${ARGOCD_CONFIG_REPO_BRANCH} # master or main

							PREVIOUS_VERSION=$(yq eval .applications.\\"${APP_NAME}\\".values.image_version "${ARGOCD_CONFIG_REPO_PATH}")
							PREVIOUS_CHART_VERSION=$(yq eval .applications.\\"${APP_NAME}\\".source_ref "${ARGOCD_CONFIG_REPO_PATH}")

							# patch ArgoCD App config with new app & chart version
							yq eval -i .applications.\\"${APP_NAME}\\".source_ref=\\"${CHART_VERSION}\\" "${ARGOCD_CONFIG_REPO_PATH}"
							yq eval -i .applications.\\"${APP_NAME}\\".values.image_version=\\"${VERSION}\\" "${ARGOCD_CONFIG_REPO_PATH}"
							yq eval -i .applications.\\"${APP_NAME}\\".values.image_namespace=\\"${IMAGE_NAMESPACE}\\" "${ARGOCD_CONFIG_REPO_PATH}"
							yq eval -i .applications.\\"${APP_NAME}\\".values.image_repository=\\"${IMAGE_REPOSITORY}\\" "${ARGOCD_CONFIG_REPO_PATH}"

							# Commit the changes :P
							git config --global user.email "jenkins@rht-labs.bot.com"
							git config --global user.name "Jenkins"
							git config --global push.default simple
							git add ${ARGOCD_CONFIG_REPO_PATH}
							git commit -m "🚀 AUTOMATED COMMIT - Deployment of ${APP_NAME} at version ${VERSION} 🚀" || rc=$?
							git remote set-url origin  https://${GIT_CREDS}@${ARGOCD_CONFIG_REPO}
							git push -u origin ${ARGOCD_CONFIG_REPO_BRANCH}

							# verify the deployment by checking the VERSION against PREVIOUS_VERSION
							until [ "$label" == "${VERSION}" ]; do
								echo "${APP_NAME}-${VERSION} version hasn't started to roll out"
								label=$(oc get dc/${APP_NAME} -o yaml -n ${DESTINATION_NAMESPACE}  | yq e '.metadata.labels["app.kubernetes.io/version"]' -)
								sleep 1
							done
							oc rollout status --timeout=2m dc/${APP_NAME} -n ${DESTINATION_NAMESPACE} || rc1=$?
							if [[ $rc1 != '' ]]; then
								yq eval -i .applications.\\"${APP_NAME}\\".source_ref=\\"${PREVIOUS_CHART_VERSION}\\" "${ARGOCD_CONFIG_REPO_PATH}"
								yq eval -i .applications.\\"${APP_NAME}\\".values.image_version=\\"${PREVIOUS_VERSION}\\" "${ARGOCD_CONFIG_REPO_PATH}"

								git add ${ARGOCD_CONFIG_REPO_PATH}
								git commit -m "😢🤦🏻‍♀️ AUTOMATED COMMIT - ${APP_NAME} deployment is reverted to version ${PREVIOUS_VERSION} 😢🤦🏻‍♀️" || rc2=$?
								git push -u origin ${ARGOCD_CONFIG_REPO_BRANCH}
								# TODO - check the roll back has not failed also...
								exit $rc1
							else
									echo "${APP_NAME} v${VERSION} deployment in ${DESTINATION_NAMESPACE} is successful 🎉 🍪"
							fi
						'''
					}
				}
			}
		}

		// 🔏 IMAGE SIGN EXAMPLE GOES HERE
        // 🔏 IMAGE SIGN EXAMPLE GOES HERE
        stage("🔏 Image Signing") {
            agent { label "jenkins-agent-cosign" }           
            options {
                    skipDefaultCheckout(true)
            }
            steps {
                script {
                    sh '''
                    oc registry login
                    cosign sign -key k8s://${TEAM_NAME}-ci-cd/${TEAM_NAME}-cosign `oc registry info`/${DESTINATION_NAMESPACE}/${APP_NAME}:${VERSION} --allow-insecure-registry
                    '''
                }
            }
        }

		// 🐝 OWASP ZAP STAGE GOES HERE
        stage('🐝 OWASP Scan') {
            agent { label "jenkins-agent-zap" }
            options {
                 skipDefaultCheckout(true)
            }
            steps {
            sh '''
                /zap/zap-baseline.py -r index.html -t https://pet-battle-${TEAM_NAME}-test.apps.ocp4.example.com || return_code=$?
                echo "exit value was  - " $return_code
            ''' }
            post {
            always {
                // publish html
                publishHTML target: [
                    allowMissing: false,
                    alwaysLinkToLastBuild: false,
                    keepAll: true,
                    reportDir: '/zap/wrk',
                    reportFiles: 'index.html',
                    reportName: 'OWASP Zed Attack Proxy'
        ] }
        } }

		// 🏋🏻‍♀️ LOAD TESTING EXAMPLE GOES HERE
        stage("🏋🏻‍♀️ Load Testing") {
            agent { label "jenkins-agent-python" }
            options {
               skipDefaultCheckout(true)
            }
            steps {
                sh '''
                git clone ${GIT_URL} pet-battle && cd pet-battle
                git checkout ${BRANCH_NAME}
                '''
                dir('pet-battle'){
                script {
                    sh '''
                    pip3 install locust
                    locust --headless --users 10 --spawn-rate 1 -H https://${APP_NAME}-${DESTINATION_NAMESPACE}.apps.ocp4.example.com --run-time 1m --loglevel INFO --only-summary
                    '''
                   }
                }
            }
        }

		// stage("🥾 Trigger System Tests") {
		// 	options {
		// 		skipDefaultCheckout(true)
		// 	}
		// 	agent { label "master" }
		// 	when {
		// 		expression { GIT_BRANCH.startsWith("master") || GIT_BRANCH.startsWith("main") }
		// 	}
		// 	steps {
		// 			echo "TODO - Run tests"
		// 			build job: "system-tests/main",
		// 						parameters: [[$class: 'StringParameterValue', name: 'APP_NAME', value: "${APP_NAME}" ],
		// 													[$class: 'StringParameterValue', name: 'CHART_VERSION', value: "${CHART_VERSION}"],
		// 													[$class: 'StringParameterValue', name: 'VERSION', value: "${VERSION}"]],
		// 						wait: false
		// 	}
		// }

		// 💥🔨 BLUE / GREEN DEPLOYMENT GOES HERE

	}
}
