#!/bin/bash
set -euo pipefail

# Parse arguments
MODE=${1:-"plan"}           # "plan" or "implement"
REPO_OWNER=${2:-""}        # GitHub username/org
REPO_NAME=${3:-""}         # Repository name
ISSUE_NUMBER=${4:-""}      # Issue number
WORKTREE=${5:-"infra"}      # "main", "feature", or "infra"

# Validation
if [ -z "$REPO_OWNER" ] || [ -z "$REPO_NAME" ] || [ -z "$ISSUE_NUMBER" ]; then
  echo "USAGE: $0 <mode> <repo_owner> <repo_name> <issue_number> [worktree]"
  exit 1
fi

# Logging
LOG_DIR="./logs"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/gemini-${MODE}-${ISSUE_NUMBER}-$(date +%Y%m%d-%H%M%S).log"

# Set environment
REPO_PATH="/home/$(whoami)/workspace/agenticflow-${WORKTREE}"
ISSUE_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/issues/${ISSUE_NUMBER}"

# Load AgenticFlow secrets
if [ -f "./cli/dist/index.js" ]; then
  # Use local CLI if built
  eval "$(node ./cli/dist/index.js secrets export)"
elif command -v agenticflow &> /dev/null; then
  # Use global CLI if available
  eval "$(agenticflow secrets export)"
else
  echo "ERROR: agenticflow CLI not found. Cannot export secrets." | tee -a "$LOG_FILE"
  exit 1
fi

echo "[$(date)] Starting Gemini agent: mode=${MODE}, issue=${ISSUE_NUMBER}, worktree=${WORKTREE}" | tee -a "$LOG_FILE"

# Navigate to correct worktree
# Note: For now, we use the current worktree if REPO_PATH doesn't exist (to support manual testing)
if [ -d "$REPO_PATH" ]; then
  cd "$REPO_PATH" || exit 1
else
  echo "WARNING: Worktree ${WORKTREE} not found at ${REPO_PATH}. Using current directory." | tee -a "$LOG_FILE"
fi

if [ "$MODE" == "plan" ]; then
  # Planning mode: Read issue, create implementation plan, post as comment
  gemini --prompt "You are an AI planning agent for the AgenticFlow project.

WORKFLOW:
1. Use GitHub MCP to fetch issue #${ISSUE_NUMBER} from ${REPO_OWNER}/${REPO_NAME}
2. Read the issue description, acceptance criteria, and any technical notes
3. Analyze the codebase context using filesystem MCP in $(pwd)
4. Create a detailed implementation plan with:
   - High-level approach
   - Files to modify/create
   - Step-by-step implementation tasks
   - Testing strategy
   - Potential risks or dependencies
5. Post the plan as a comment on the issue using GitHub MCP
6. Add the 'state:planning' label (to acknowledge receipt) and once done, add a label indicating review is needed (e.g. 'state:review-plan')

Repository: ${REPO_OWNER}/${REPO_NAME}
Issue: #${ISSUE_NUMBER}
Worktree: ${WORKTREE} ($(pwd))

Format your plan in clean markdown with sections." \
    --yolo \
    2>&1 | tee -a "$LOG_FILE"

elif [ "$MODE" == "implement" ]; then
  # Implementation mode: Read plan, write code, commit, update issue
  gemini --prompt "You are an AI coding agent for the AgenticFlow project.

WORKFLOW:
1. Use GitHub MCP to fetch issue #${ISSUE_NUMBER} from ${REPO_OWNER}/${REPO_NAME}
2. Read the approved implementation plan from the comments
3. Navigate to $(pwd) using filesystem MCP
4. Implement the changes according to the plan:
   - Modify/create files as specified
   - Follow existing code patterns and style
   - Add appropriate comments
   - Ensure code quality
5. Create a git commit with descriptive message
6. Push changes to the '${WORKTREE}' branch
7. Post a summary comment on the issue with:
   - Files changed
   - Brief description of implementation
   - Link to commit
8. Remove 'state:implementing' label
9. Add 'state:review-code' label to signal completion

Repository: ${REPO_OWNER}/${REPO_NAME}
Issue: #${ISSUE_NUMBER}
Worktree: ${WORKTREE} ($(pwd))
Branch: ${WORKTREE}

IMPORTANT: 
- Test your changes if possible
- Use semantic commit messages
- Do not break existing functionality" \
    --yolo \
    2>&1 | tee -a "$LOG_FILE"

else
  echo "ERROR: Invalid mode '${MODE}'. Use 'plan' or 'implement'." | tee -a "$LOG_FILE"
  exit 1
fi

echo "[$(date)] Gemini agent completed: mode=${MODE}, issue=${ISSUE_NUMBER}" | tee -a "$LOG_FILE"
