#!/bin/bash

# exit when any command fails
set -e

function status() {
    echo "--- ${1}"
}

function fail() {
    echo "--- ${1}"
    exit 1
}

APP_CFG="./scripts/app_config.json"
CFG_SCRIPT="./scripts/env.sh"
APP_SCRIPT="./scripts/setenv.ts"

# --profile=lf-ec${ENV}-andy
GIT_REPO=`git remote get-url --push origin | sed "s/^.*\///" | sed "s/\.git//"`
GIT_BRANCH=`git rev-parse --abbrev-ref HEAD`

case $GIT_BRANCH in
  "master")
    AWS_REGION="us-east-2"
    ENV=prod
    NODE_ENV=prooduction
    ;;
  "qa")
    AWS_REGION="us-east-1"
    ENV=qa
    NODE_ENV=test
    ;;
  *)
    AWS_REGION="us-east-2"
    ENV=integration
    NODE_ENV=development
    ;;
esac
BUCKET="rbook-${ENV}-builds"



# $1 - appName
function getAppId {
  aws amplify list-apps \
  | jq '.apps[]' \
  | jq -r "select(.name==\"$1\")" \
  | jq -r '.appId'
}

# $1 - appId
# $2 - branch
function verifyBranch {
  aws amplify list-branches \
    --app-id "$1" \
    | jq '.branches[]' \
    | jq "select(.branchName==\"$2\")" \
    | jq -r '.branchName'
}

# $1 - appId
function getAmplifyCfg {
  aws amplify get-app --app-id ${APPID} > ${APP_CFG}
  status "Amplify Application configuration written to ${APP_CFG}"
}

function makeEnvScript {

  DT=`date +%Y%m%d.%H%M.%s`

  [ ! -f ${APP_CFG} ] && fail "No Amplify Application configuration at ${APP_CFG}"
  cat ${APP_CFG} \
    | jq -r '.app.environmentVariables|to_entries|map("export \(.key)=\"\(.value|tostring)\"") | .[]' \
    > ${CFG_SCRIPT}

  cat >> ${CFG_SCRIPT} << __END!__
export APPID="${APPID}"
export AWS_REGION="${AWS_REGION}"
export ENV="${ENV}"
export GIT_REPO="${GIT_REPO}"
export GIT_BRANCH="${GIT_BRANCH}"
export BUILD_NAME="${GIT_REPO}-${GIT_BRANCH}-${DT}"
export GATSBY_BUILD="${GIT_BRANCH}.${DT}"
export NODE_ENV="${NODE_ENV}"
__END!__

  sort -o ${CFG_SCRIPT} ${CFG_SCRIPT} 
  status "Application environment script written to ${CFG_SCRIPT}"
}

function config {
  if [ -f "${APP_SCRIPT}" ] ; then 
    bash -c "source ${CFG_SCRIPT} && node ${APP_SCRIPT}"
  else 
    status "No application configuration script found - skipping."
  fi
}

function do_configure {
    status "Using remote repository $GIT_REPO"
    APPID=`getAppId $GIT_REPO`
    status "Amplify Application ID is ${APPID}"
    BRANCH=`verifyBranch $APPID $GIT_BRANCH`
    if [ -z "$BRANCH" ]; then 
      status "No Amplify branch for current repo branch ($GIT_BRANCH)"
    else
      status "Amplify branch (${BRANCH}) found for repo branch ($GIT_BRANCH)"
    fi
    getAmplifyCfg $APPID
    makeEnvScript
    config
}

function do_build {
    status "Install packages..."
    yarn install

    source ./scripts/env.sh
    status "Build application..."
    yarn run build
}

# $1 - zip name
# $2 - file directory to zip
function buildZip {
    status "Building ${1}.zip"
    LD=`pwd`
    cd $2
    zip -9rqo ${LD}/${1}.zip *
    cd $LD
}

# $1 - zip name
# $2 - bucket name
function uploadZip {
  status "Uploading ${1}.zip => s3://${2}"
  aws s3 cp "${1}.zip" "s3://${2}"
}

function killBlockingJobs {
    status "Checking for conflciting jobs..."
    JOBS="TBD"
    while [ ! -z "${JOBS}" ]; do
      JOBS=$(aws amplify list-jobs --app-id ${APPID} --branch-name ${BRANCH} | jq -r  '.jobSummaries[] | select(.status=="RUNNING") | .jobId')
      if [ ! -z "$JOBS" ]; then
        status "Waiting for existing build job(s) ${JOBS} for branch ${BRANCH} of ${APPID} to stop"
        for JOB in "$JOBS" ; do
          status "Stopping existing build ${JOB} for branch ${BRANCH} of ${APPID}"
          aws amplify stop-job --app-id ${APPID} --branch-name ${BRANCH} --job-id ${JOB}
        done
        sleep 10
      fi
    done
}

# $1 job id
function waitForBuild {
    STATUS="TBD"
    while [ "SUCCEED" != "${STATUS}" ] && [ "FAILED" != "${STATUS}" ]; do
      STATUS=$(aws amplify get-job \
        --app-id ${APPID} \
        --branch-name ${BRANCH} \
        --job-id ${1} \
        | jq -r  '.job.summary.status')
      sleep 10
    done
    echo $STATUS
}

function do_deploy {
  status "Deploy..."

  source ./scripts/env.sh

  if [ ! -z "${APPID}" ] ; then
    BRANCH=`verifyBranch $APPID $GIT_BRANCH`
    if [ ! -z "${BRANCH}" ]; then
      status "Existing Amplify environment found for branch ${GIT_BRANCH}"

      buildZip ${BUILD_NAME} ./build

      uploadZip ${BUILD_NAME} ${BUCKET}

      killBlockingJobs

      status "Starting deployment..."
      DEP=`aws amplify start-deployment --app-id ${APPID} --branch-name ${BRANCH} --source-url "s3://${BUCKET}/${BUILD_NAME}.zip"`
      JOBID=`echo "$DEP" | jq -r .jobSummary.jobId`

      status "Waiting for deployment to finish..."

      STATUS=`waitForBuild $JOBID`
      case ${STATUS} in
        "SUCCEED")
          status "Deployment SUCCESS"
          ;;

        "FAILED")
          status "Deployment FAILED"
          exit 1
          ;;
      esac
    else
      status "No Amplify environment found for ${GIT_BRANCH}"
    fi
  else
    status "No Amplify appId specified"
  fi
}


case ${1} in 
  "repo")
    status "Using remote repository $GIT_REPO"
    ;;

  "appId")
    APPID=`getAppId $GIT_REPO`
    status "Amplify Applicaiotn ID is ${APPID}"
    ;;

  "branch")
    APPID=`getAppId $GIT_REPO`
    BRANCH=`verifyBranch $APPID $GIT_BRANCH`
    if [ -z "$BRANCH" ]; then 
      status "No Amplify branch for current repo branch ($GIT_BRANCH)"
    else
      status "Amplify branch (${BRANCH}) found for repo branch ($GIT_BRANCH)"
    fi
    ;;

  "amplifyCfg")
    APPID=`getAppId $GIT_REPO`
    getAmplifyCfg $APPID
    ;;

  "makeEnv")
    makeEnvScript
    ;;

  "config")
    config
    ;;

  "configure")
    do_configure
    ;;

  "build")
    do_build
    ;;

  "deploy")
    do_deploy
    ;;

  "all")
    do_configure
    do_build
    do_deploy
    ;;



  *)
    echo
    echo "   Usage:  ${0} <option>"
    echo
    echo "   where option is one of:"
    echo "      repo - show remote repository name - used as appname"
    echo "      appId - retrieve Amplify App ID based on repo name as app name"
    echo "      branch - retrieve Amplify branch matching current branch (if any)"
    echo "      amplifyCfg - retrieve and store Amplify app configuration"
    echo "      makeEnv - create and store environment script ($CFG_SCRIPT}"
    echo "      config - create and store application configuration"
    echo 
    echo "      configure - run all configuration steps"
    echo "      build - prepare application for packaging"
    echo "      deploy - package and dep[loy the applicaiotn"
    echo 
    echo "      all - run configure, build, then deploy in sequence"
    echo
    ;;
esac
