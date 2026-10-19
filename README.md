# Cryptiva — Secure File Sharing System

**A cybersecurity Final Year Project (FYP) developed to provide a safer way to upload, share, and download files through controlled access and file integrity verification.**

Cryptiva is a web-based secure file-sharing application designed to address common risks associated with transferring files online. It combines file encryption, secure sharing links, access restrictions, malware scanning, and integrity verification to help protect shared files throughout the sharing process.

**Live Demo:** https://cryptiva.smolelab.com  
**Repository:** https://github.com/akagami-27/Cryptiva

> **Project status:** Developed as a university cybersecurity FYP. Features and security controls should be evaluated through testing; this project does not claim that all security risks can be eliminated.

## Features

- **Secure file sharing** — Share files through generated links.
- **File encryption** — AES-based encryption to protect file contents.
- **Password-protected downloads** — Restrict access to shared files with a password.
- **File integrity verification** — Use SHA-256 hashes to detect changes to file contents.
- **Link expiration** — Configure sharing links to expire.
- **Download restrictions** — Enforce download limits on shared files.
- **Malware scanning** — Integrate ClamAV to scan uploaded files.
- **User authentication** — Support authenticated access to application functionality.
- **CSRF protection** — Apply Cross-Site Request Forgery protection to relevant state-changing requests.
- **Activity logging** — Record relevant application activities for monitoring and review.

## Technology Stack

| Component | Technology |
|---|---|
| Backend | Node.js, Express.js |
| Frontend | React, Vite, JavaScript |
| Database | MongoDB |
| File storage | Supabase Storage |
| Encryption | AES-based encryption |
| Integrity verification | SHA-256 |
| Malware scanning | ClamAV |
| Testing | Node.js built-in test runner |
| Containerization | Docker |
| Source control | Git and GitHub |

## System Overview

Cryptiva uses a web frontend to communicate with an Express.js backend. The backend manages application requests, authentication, file-sharing rules, and security checks, while the database and object-storage service support application data and file storage.

A typical file-sharing workflow is:

1. The user authenticates and uploads a file.
2. The application processes the file according to its security controls.
3. A sharing link is generated with applicable access restrictions.
4. The recipient opens the link and completes any required password verification.
5. The application checks access conditions, including expiration and download limits.
6. File integrity is verified using SHA-256 before the download is provided.

The precise behavior depends on the implemented application configuration and security controls.

## Security Considerations

Cryptiva incorporates several security mechanisms as part of its development and testing process:

- **Confidentiality:** Encryption helps protect file contents.
- **Integrity:** SHA-256 verification helps detect unexpected file modifications.
- **Access control:** Authentication, password-protected sharing, and download restrictions limit access.
- **Availability and resource control:** Expiration and download limits help constrain access to shared resources.
- **Malware detection:** ClamAV provides an additional scanning layer for uploaded files.
- **Request protection:** CSRF controls help protect relevant state-changing requests.

These controls serve different purposes and are not substitutes for one another. Their effectiveness depends on correct implementation, configuration, key management, and operational security.

## Getting Started

### Prerequisites

Install the following software before running the application locally:

- Node.js and npm
- MongoDB, either locally or through an appropriately configured development instance
- Access to a separate development Supabase project and storage bucket
- ClamAV, configured for the operating system or container environment being used
- Git

### 1. Clone the repository

```bash
git clone https://github.com/akagami-27/Cryptiva.git
cd Cryptiva
```

### 2. Install backend dependencies

```bash
npm install
```

### 3. Install frontend dependencies

```bash
cd client
npm install
cd ..
```

### 4. Configure environment variables

Create a local `.env` file using the environment configuration expected by the application. Configure the appropriate development database, storage service, application URL, session and token secrets, encryption key, and malware scanner paths.

Use development credentials and isolated development services. Generate appropriate secrets locally, and never commit `.env` files, production credentials, encryption keys, or other sensitive values to GitHub.

Ensure that your MongoDB and Supabase configuration points to the intended development resources before testing uploads or downloads.

### 5. Start the application

Start the backend from the repository root:

```bash
npm start
```

In a separate terminal, start the frontend development server:

```bash
cd client
npm run dev
```

Open the local URL printed by Vite in your terminal.

**Note:** The backend and frontend may require different environment settings. Use the application's existing configuration and terminal output to confirm the correct local ports and service connectivity.

## Testing and Build

Run the backend test suite from the repository root:

```bash
npm test
```

Build the frontend for production:

```bash
npm run client:build
```

Check the JavaScript syntax of the backend entry point:

```bash
node --check server.js
```

Some tests may be skipped depending on the test environment or configuration. A passing test suite does not, by itself, establish that the deployed application is free of vulnerabilities.

## Repository Structure

```text
Cryptiva/
├── client/                 # React frontend and Vite configuration
├── config/                 # Application configuration
├── docs/
│   ├── architecture/       # System and deployment diagrams
│   ├── fyp/                # FYP architecture documentation
│   └── security/            # Threat modelling and security controls
├── services/               # Backend services
├── tests/                  # Automated tests
├── server.js               # Express application entry point
├── package.json            # Backend scripts and dependencies
├── Dockerfile              # Container image configuration
└── .dockerignore            # Files excluded from Docker builds
```

The structure above highlights key project areas; additional files and directories support the application's routes, middleware, frontend pages, and configuration.

## Documentation

The repository includes supporting architecture and security documentation:

- `docs/architecture/system-architecture.mmd` — System architecture diagram.
- `docs/architecture/deployment-architecture.mmd` — Deployment architecture diagram.
- `docs/fyp/architecture-and-threat-model.md` — Architecture and threat-model overview.
- `docs/security/stride-threat-model.md` — STRIDE-based threat analysis.
- `docs/security/security-control-traceability.md` — Mapping of identified threats to security controls.

## Deployment

The project includes Docker-related configuration and deployment documentation. The live demonstration is available at:

**https://cryptiva.smolelab.com**

For deployment, configure production-specific environment variables, database connectivity, storage permissions, encryption keys, malware-scanning dependencies, HTTPS, and health checks. Keep development and production resources separate, and establish appropriate backups and monitoring.

## Limitations

Cryptiva is an academic project and demonstration of secure software development practices. Its security should not be assumed solely from the presence of encryption, hashing, malware scanning, or access controls.

A production deployment requires ongoing security testing, dependency maintenance, secure secret management, monitoring, backup and recovery procedures, and validation of the complete deployment environment.

## Project Purpose

This project applies cybersecurity principles and secure software development practices to the design and implementation of a web-based file-sharing system. It provides an opportunity to explore application security, cryptographic controls, access management, threat modelling, automated testing, and deployment practices.

## Author

**Muhammad Husni bin Mohd Hardi**  
Cybersecurity Technology Student  
Universiti Kuala Lumpur (UniKL MIIT)

---

*Developed for academic purposes as a Cybersecurity Final Year Project.*
