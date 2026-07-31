For Submissions to the Prometheus July AI Challenge
**PatchIt! is a real-time competitive JavaScript debugging game built for the AI coding generation.**

Due to the rise of AI and vibe-coding many rely on AI to fully replace their workflow, when something inevitibly fails users may repeatedly send the broken code back to an AI model instead of debugging the code themselves. This can introduce additional changes, create new bugs, and make the original issue even harder to understand. PatchIt! addresses this problem by turning debugging into a fast-paced multiplayer game.

This app presents you with matchmaking capabilities so you and your friend can compete and see who can debug the fastest in javascript. Compete with your friend and CATCH BUGS IN REAL TIME

**Future Work**
- endless/zen/singleplayer mode
- lobby settings
- player colors
- bug attack when someone finishes their debugging like tetris

# How to run
1. Download the repo
2. Run `npm install` in the terminal
3. Add an `.env` file with the variables
```python
VITE_API_AI_KEY = "YOUR_OPENAI_API_KEY"
VITE_USE_LOCAL_CHALLENGES=false
```
4. And finally `npm run dev` to enjoy
