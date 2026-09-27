# Rule: System Testing and Quality Assurance

## 1. Test-Driven Workflow and Test Plans
- **Test Plan Generation:** Whenever a new feature is initiated (via `features.md`), the AI must formulate a comprehensive **Test Plan** before or alongside the system architecture design.
- **Verification:** Upon completion of the feature's code implementation, the AI must verify that all tests defined in the Test Plan have been successfully written and executed. A feature cannot be marked as `[x]` in `features.md` until its Test Plan is fully realized.

## 2. Automation Scripts and Static Analysis
The AI must maintain executable scripts (e.g., via Gradle tasks) to perform the following checks automatically:
- **Compilation Check:** Verify that the project compiles cleanly without errors.
- **Linting & Code Quality:** Run static code analysis tools (e.g., `ktlint`, `detekt` for Kotlin) to detect syntax errors, code smells, and formatting violations.
- **Test Execution:** A unified script to run all test suites across the repository.

## 3. Mandatory Test Categories
The system must be validated using the following test types:

1. **Unit Tests:** 
   - Verify the business logic of small, isolated components, functions, and classes.

2. **Integration Tests:** 
   - Validate the interaction between multiple components or layers (e.g., database interactions, API endpoints).
   - Must explicitly cover three scenarios for every feature: 
     - **Happy Path** (Successful execution).
     - **Failure Scenarios** (Expected errors, e.g., network timeout, invalid credentials).
     - **Edge/Exceptional Cases** (Boundary values, unexpected inputs).

3. **UI / Visual Component Tests (Client App Repositories):** 
   - Validate the graphical user interface using the **Compose UI Test framework**.
   - Must verify that UI components render correctly, handle simulated user interactions (clicks, scrolls), and reflect the proper states across different device configurations.

4. **Performance Tests (Server Repository):** 
   - Conduct load and stress testing on the backend infrastructure using **k6** (utilizing Kotlin DSL/integrations).
   - Verify API response times, database query efficiency, and system stability under high concurrent user loads.

5. **Code Coverage Tests:** 
   - Every repository must integrate a code coverage tool (e.g., Kover or JaCoCo).
   - **Hard Coverage Threshold:** The CI/CD pipeline and local test scripts must **fail the build** if the overall code coverage falls below **75%**.
