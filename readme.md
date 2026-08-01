<p align="center">
  <img src="images/logo-512.png" width="100" alt="WebSlurp Logo">
</p>

# WebSlurp

![Version](https://img.shields.io/badge/version-1.9-blue)
![Manifest](https://img.shields.io/badge/Manifest-V3-orange)
![Chrome](https://img.shields.io/badge/Chrome-DevTools-success)
![License](https://img.shields.io/badge/license-MIT-green)


**Capture. Edit. Replay. Right inside Chrome DevTools.**

WebSlurp lets you capture network requests directly from Chrome DevTools, edit them, and replay them instantly — no proxy setup, no switching between tools.

It's the fastest way to inspect and replay HTTP requests when testing web applications and APIs.

Think **Burp-style request replay with a Postman-like interface**, built right into your browser.

![screenshot1](images/request-view.png)

![screenshot1](images/response-view.png)

[![Demo](preview.gif)](https://github.com/user-attachments/assets/74166d33-ee1f-4667-89a6-1c98f8ec1886)

## ✨ Features

- **Capture API requests or all URLs**  
  Automatically intercept HTTP/HTTPS traffic from the inspected page, with smart filtering to focus on API calls or all resources.

- **Edit methods, parameters, headers, and request bodies**  
  Modify any aspect of a captured request before replaying it — change HTTP method, URL parameters, headers, and body content.

- **Replay requests instantly**  
  Send edited requests directly from the DevTools panel and see the response immediately.

- **Filter by keyword, request method, or response status**  
  Quickly narrow down the request list with flexible search and status‑code filters.

- **Custom capture filters**  
  Skip images, CSS, JavaScript, fonts, media, WebSocket, and OPTIONS requests to keep your view clean and focused.

- **Add Notes**  
  Attach custom notes to any request for documentation, collaboration, or personal reference.

- **Search inside response**  
  Highlight and navigate through text within the response body using the built‑in search.

- **Copy requests as cURL**  
  Export any request as a `curl` command for use in terminals or scripts.

- **Save your work to a file**  
  Export all logs (or filtered logs) as JSON, and import them later to continue your analysis.

- **18 light and dark themes**  
  Choose from 18 carefully crafted themes, including VS Code, JetBrains, One Dark, Solarized, Dracula, GitHub, and many more.

- **Attack Surface Analysis** *(new)*  
  Automatically evaluate the authorization and business logic attack surface of each endpoint, with scoring and actionable indicators to highlight potential security risks.

### 🛡️ Attack Surface Analysis

WebSlurp now includes a built‑in attack surface analyzer that examines each request’s URL path and query parameters to detect patterns that may indicate authorization flaws or business logic vulnerabilities. For each request, it provides:

- **Authorization Potential Score** – based on presence of object identifiers, privileged paths, and ownership references.
- **Business Logic Potential Score** – based on financial, workflow, or resource‑manipulation patterns.
- **Actionable Indicators** – specific patterns found (e.g., numeric IDs, UUIDs, admin paths, quantity parameters) that may require manual security testing.

This helps security testers and developers quickly identify high‑risk endpoints during dynamic analysis.

## A Shorter Workflow

| Postman                     | Burp Suite          | WebSlurp           |
| --------------------------- | ------------------- | -------------------- |
| Open browser                | Open browser        | Open browser         |
| Inspect Network → XHR/Fetch | Open Burp Suite     | Inspect → WebSlurp |
| Copy request data           | Capture / intercept | Edit request         |
| Open Postman                | Edit request        | Send request         |
| Build / import request      | Send request        |                      |
| Edit request                |                     |                      |
| Send request                |                     |                      |

WebSlurp keeps the workflow where the request already happens: **inside your browser**.

## Try It

Install WebSlurp, open Chrome DevTools, and start capturing.

## Installation

1. Clone the repository

    ```bash
    git clone https://github.com/hangga/webslurp.git
    ```

2. Open Chrome Extensions → Developer Mode (Enable)
   <p align="left">
    <img src="images/chrome-extension.png" width="500"/>
   </p>
3. Click Load unpacked. 
4. Select the **webslurp** directory.

A new **WebSlurp** tab will appear.

<p align="center">
Made with ❤️ by <a href="https://hangga.web.id/">Hangga Aji Sayekti</a>
</p>