// Convert RGB to ANSI 256 color code
export function rgbToAnsi256(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

// Stylized logger
export class Logger {
    static statement(message: string, emoji: string = " ") {
        console.log(`\x1b[0;95m▌${emoji}${message}\x1b[0m`);
    }
    static success(message: string) {
        console.log(`\x1b[1;92m▌ \x1b[0m${message}\x1b[0m`);
    }
    static error(message: string) {
        console.error(`\x1b[1;91m▌ \x1b[0m${message}\x1b[0m`);
    }
    static info(message: string) {
        console.log(`\x1b[0;36m▌\x1b[0m ${message}\x1b[0m`);
    }
    static warning(message: string) {
        console.warn(`\x1b[1;93m▌ \x1b[0m${message}\x1b[0m`);
    }
    static log(message: string) {
        console.log(message);
    }
    static dim(message: string) {
        console.log(`\x1b[0;30m▌ ${message}\x1b[0m`);
    }
    static rgb(r: number, g: number, b: number, message: string) {
        console.log(`\x1b[38;2;${r};${g};${b}m${message}\x1b[0m`);
    }
    static hex(color: string, message: string) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        this.rgb(r, g, b, message);
    }

}