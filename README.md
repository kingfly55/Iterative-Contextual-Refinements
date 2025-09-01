# Iterative Contextual Refinements

This application is a powerful, multi-agent platform for iterative software development and complex problem-solving. It leverages a sophisticated system of specialized AI agents to generate, refine, and perfect various outputs, from complete websites and React applications to in-depth analytical solutions.

## Features

- **Multi-Agent Architecture:** Utilizes a team of specialized AI agents for different tasks, ensuring high-quality results.
- **Iterative Refinement:** Employs a cyclical process of generation, critique, and refinement to progressively improve outputs.
- **Multiple Modes:** Offers several distinct modes for various tasks:
  - **HTML Mode:** For iteratively building production-grade, standalone HTML websites.
  - **Deepthink Mode:** For tackling complex problems through a rigorous process of strategy, tactics, and verification.
  - **React Mode:** For developing complete React applications using a multi-agent, component-based approach.

## Architecture

This application is built on a foundation of distinct, powerful modes, each with its own unique architecture.

### HTML Mode (Iterative Website Generation)

The HTML mode is designed for the iterative creation of production-quality, single-file HTML websites. It simulates a team of AI web developers with specialized roles, ensuring a high degree of quality, accessibility, and responsiveness.

- **Initial Generation:** The process begins with a `CodeCrafter Apex` agent that generates a complete, standalone HTML file based on an initial user idea.
- **Iterative Refinement with JSON Patching:** Subsequent improvements are made through a series of JSON patch operations (`replace`, `insert_after`, `insert_before`, `delete`). This allows for precise, targeted modifications to the HTML document.
- **Specialized AI Personas:** Each stage of the refinement process is handled by a different AI persona with a specific focus:
  - **`CodeSentinel Omega`:** A bug-fixing agent that identifies and rectifies errors in the code.
  - **`FeatureOracle Max` & `FeatureStrategist Ultra`:** Feature-suggestion agents that propose new functionalities and improvements.
  - **`CodeIntegrator Elite`:** An implementation agent that seamlessly integrates new features into the existing codebase.
  - **`CodeAuditor Maximus`:** A refinement agent that further improves the quality of the code.
  - **`CodeValidator OmegaPrime`:** A final polishing agent that ensures the website is production-ready.
- **Quality-Centric Approach:** The entire process is geared towards producing high-quality, accessible, responsive, and semantically correct HTML, adhering to the latest web standards.

### Deepthink Mode (Complex Problem Solving)

The Deepthink mode employs a multi-agent system for tackling complex, analytical problems. It breaks down a challenge into manageable parts, explores multiple solution paths in parallel, and rigorously verifies the results.

- **Strategy and Tactics:** The process starts with a `Master Strategy Agent` that formulates several high-level strategies. Each strategy is then broken down into more detailed `sub-strategies` (tactics) by a `Master Tactical Agent`.
- **Parallel Execution:** Each sub-strategy is assigned to an `Execution Agent` that attempts to solve the problem according to the given plan. This parallel approach allows for the exploration of multiple solution paths simultaneously.
- **Knowledge Sharing:** A central `Knowledge Packet` is used to share verified information, such as the results of hypothesis testing, among the agents. This ensures that all agents are working with the most up-to-date and accurate information.
- **Rigorous Verification:** The system includes several layers of verification to ensure the quality and accuracy of the final solution:
  - **`Deepthink Verifier`:** An agent that identifies and fixes flaws in a generated solution.
  - **`Strategic Evaluator Prime` (Red Team):** An agent that filters out weak or flawed strategies.
  - **`Analyticus Veritas` (Judge):** An agent that selects the best solution from the different sub-strategies.
  - **`Analyticus Ultima` (Final Judge):** An agent that selects the single best overall solution.
- **Logical and Unbiased:** The Deepthink mode is designed to be highly logical and to avoid common LLM biases and pitfalls, such as making unjustified assumptions.

### React Mode (Multi-Agent App Development)

The React mode automates the development of complete, production-quality React applications using a team of specialized AI agents.

- **Orchestrator and Worker Agents:** The process is managed by a `React Maestro Orchestrator` agent that creates a detailed development plan. This plan is then executed by a team of five `worker agents`, each with a specific role.
- **The `plan.txt`:** The orchestrator generates a comprehensive `plan.txt` file that serves as the single source of truth for the entire project. This plan outlines the application's architecture, component structure, state management, and the division of labor among the worker agents.
- **Component-Based Architecture:** The architecture emphasizes a modern, component-based approach using React with TypeScript, Vite for bundling, and a state management library like Zustand or Redux Toolkit.
- **Parallel Development:** The plan defines clear interface contracts between the different parts of the application, allowing the worker agents to develop their assigned components and modules in parallel.
- **Production-Ready Code:** The goal of the React mode is to produce clean, maintainable, and production-ready code that adheres to the latest best practices.
- **File-Based Output:** Each worker agent generates the code for its assigned files, which are then assembled to create the final application. The output of each agent is clearly marked with a file path comment (`// --- FILE: path/to/file.tsx ---`) to ensure proper assembly.

## Getting Started

**Prerequisites:** Node.js

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Run the app:**
   ```bash
   npm run dev
   ```
3. **Enter your Gemini API Key:**
   Open the application in your browser and enter your Gemini API Key in the input field at the top left of the page.

## Usage

Once the application is running, you can select one of the available modes (HTML, Deepthink, or React) and provide an initial prompt or idea. The AI agents will then begin the iterative process of generating, refining, and perfecting the output based on your input. You can guide the process by providing feedback and selecting from the suggestions provided by the agents.