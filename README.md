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
git clone https://github.com/Alabalala/horari.git

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

## 💡 Why AI? - This part is AI-free
Up until now, I had generally only used AI as a side/research tool when coding. I had played around with agents/MCPs, but I had never used an AI IDE. And I was fascinated by the idea, but I was also scared.

I downloaded TRAE to play around with it, when a client contacted me to see if I could develop a small Windows app for them. I saw this as the perfect opportunity to test TRAE's power. I also wanted to try Electron out, so the timing was great.

Moreover, I know companies look for people who can write code, but can also use AI and leverage its power to write better code in less time.

The client shared with me an Excel file which they had been using for shifts, but they had to copy/paste stuff constantly, formulas were breaking, etc. 

<img width="917" height="490" alt="image" src="https://github.com/user-attachments/assets/a642b370-c9d6-4cb2-88ef-d7e30a0ad5d0" />

I analysed the Excel file and wrote a list of base features:

- Managing employees
- Managing shifts
- Dashboard with summary of everything
- Settings

<img width="2613" height="1518" alt="image" src="https://github.com/user-attachments/assets/09015f0f-af8d-419b-8574-5c2c811c2696" />

So I started writing prompts and building the app. I couldn't honestly believe the speed at which this thing was technically building itself. I was orchestrating it and guiding it, but it was doing most of the work.

It's scary, yes. But it's also amazing I was doing things that would normally take me hours in a few seconds. And yes there were moments when the AI would hit a wall or get into an infinite problem uncapable to sort a problem out, but the number of times that happened is anecdotical. 

There were a lot of times where I actually wanted to be the one writing the code, instead of AI. At the end of th4e day, I became a programmer because I love it. But I think that's the great thing about this: you can use AI for the repetitive tasks, the things we don't like doing, we need to automate, etc. And then use our time to work on the parts we love.

I'm really excited to see what can I build next.

# Summary
![Days to MVP](https://img.shields.io/badge/Days%20to%20MVP-3-blueviolet?style=for-the-badge&logo=clockify)
![Total Prompts](https://img.shields.io/badge/Prompts-90-blue?style=for-the-badge&logo=openai)
![Manual Code](https://img.shields.io/badge/Manual%20Code-%3C20%20Lines-green?style=for-the-badge&logo=visualstudiocode)
