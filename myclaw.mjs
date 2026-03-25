#!/usr/bin/env Node

/**
 * MyClaw Bootstrap Entry
 *
 * This is the executable entry point for the myclaw CLI.
 * It performs version checks and then delegates to the main entry.
 */
const MIN_NODE_VERSION = 20;

//获取当前Node.js主版本号
const major = parseInt(process.versions.node.split(".")[0], 10);//parseInt将字符串转换为十进制整数
if (major < MIN_NODE_VERSION) {
    console.error(
        `MyClaw requrie Node.js v${MIN_NODE_VERSION}+. Current: ${process.versions.node}`
    );
    console.error("please upgrade Node.js");
    process.exit(1);//退出进程
}

process.env.NODE_NO_WARNINGS = "1";

try {
    await import("./dist/entry.js"); //尝试动态导入编译后的文件
} catch {
    //如果导入失败，进入内层尝试
    try {
        await import("./src/entry.ts");
    } catch (e) {
        //如果源文件加载失败
        console.error("Failed to start MyClaw. Run 'npm run build' first or use 'npm run dev'.");
        console.error(e); //输出具体错误信息
        process.exit(1);
    }
}