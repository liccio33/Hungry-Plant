# Little Hungry Plant — Lab 5

An interactive Venus flytrap controlled by a Teachable Machine image classifier and TensorFlow.js. Includes the supplied model unchanged (labels: `open`, `closed`, `none`).

## Run
1. Extract this project. Open its folder in VS Code in WSL.
2. Install Live Server in WSL. Right-click index.html → Open with Live Server.
3. Open http://localhost:5500 (use the actual Live Server port). Do not open index.html with file://.
4. Internet is required for the pinned CDN libraries. Click Start camera and allow access.
5. Show an open palm, then close your fist when the insect enters the dotted circle. Move your hand out of view to idle. Stop camera releases the camera. Demo buttons work without a camera.

## Interaction
Only a change to closed after open can trigger a catch; holding a fist cannot repeatedly score. Confidence threshold is 0.85, stable input duration 180 ms, cooldown one second. Adjust these in script.js if needed. None retains the current shape and disarms the trap; open again to rearm.

## Biomimicry and feedback
Inspired by the Venus flytrap's stimulus-driven closure. The player observes an insect and times a gesture; the model classifies the gesture and code animates the trap. Catch/miss feedback informs the next gesture. This is a simplified interaction, not an exact simulation of trigger-hair physiology, digestion, or biological timing.

Loop: player observes insect → hand gesture → camera → model classification → trap closes → catch/miss feedback → player adjusts next gesture.

## Files
- index.html: page and dependencies
- style.css: layout
- script.js: camera, inference, animation and game rules
- my_model/model.json, metadata.json, weights.bin: supplied trained model

## GitHub
Create an empty GitHub repository, then run in this folder:

```bash
git init
git add .
git commit -m "Add gesture-controlled flytrap lab"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```
Replace the URL with your actual repository URL. Authenticate with your GitHub account when prompted. Pushing a repository does not automatically publish a website. No repository has been created or pushed by this package.

## Validation
The code and model packaging were checked; real camera recognition must be tested on your own computer. No training images are included. Camera frames are processed in the browser by this code, not uploaded by the application.
