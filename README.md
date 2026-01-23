# Horari

**Horari** is a modern, efficient, and local-first weekly scheduling application designed to streamline employee shift management. It provides a clean, visual interface for managing staff schedules and generating professional print-ready exports.

> 🤖 **Built with AI & Trae**
>
> This entire application was architected and built using **Trae**, an adaptive AI IDE. From the initial concept to the final production build, every line of code was crafted through the collaboration between me and Trae's AI agent.

## ✨ Features

- **Visual Scheduler**: Intuitive drag-and-drop interface for managing weekly shifts.
- **Employee Management**: comprehensive staff database with color-coding.
- **Professional Exports**: Generate high-quality PDF and PNG schedules optimized for printing (featuring "Blue Line" shift visualization).
- **Smart Shift Handling**: Seamless support for cross-day shifts (e.g., night shifts) and overlap validation.
- **Local Data**: Secure, offline-first data storage using SQLite.
- **Auto-Updates**: Integrated auto-update mechanism via GitHub Releases.

## 🛠️ Technology Stack

Horari is built with a modern, robust stack ensuring performance and maintainability:

- **Core**: [Electron](https://www.electronjs.org/) (v39)
- **Frontend**: [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) concepts
- **Database**: [SQLite](https://www.sqlite.org/) (via `better-sqlite3`)
- **Export Engine**: `html2canvas` + `jspdf` for pixel-perfect rendering
- **Icons**: [Lucide React](https://lucide.dev/)
- **Build Tool**: [Electron Vite](https://electron-vite.org/)

## 🚀 Project Setup

### Prerequisites
- Node.js (v18+)
- pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/YourGitHubUsername/horari.git

# Install dependencies
pnpm install
```

### Development

```bash
# Start the app in development mode
pnpm dev
```

### Build

```bash
# Build for production (Windows)
pnpm dist
```
