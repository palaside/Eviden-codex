import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { readExportRequest, runCommand, runPdfExporter, safeFileStem, verifyPdfProtection } from "@/lib/server/export-process";

export const runtime = "nodejs";

async function sha256(filePath: string) {
  const hash = createHash("sha256");
  hash.update(await fs.readFile(filePath));
  return hash.digest("hex");
}

export async function POST(request: Request) {
  let tempDir = "";
  try {
    const body = await readExportRequest(request);
    if (typeof body.exportPassword !== "string" || body.exportPassword.length > 256) {
      return NextResponse.json({ error: "รหัสผ่านไม่ถูกต้องหรือยาวเกินกำหนด" }, { status: 400 });
    }
    if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
      return NextResponse.json({ error: "ไม่พบข้อมูลสำหรับสร้างแพ็กเกจ" }, { status: 400 });
    }

    const password = body.exportPassword.trim();
    const payload = body.payload as Record<string, unknown>;
    const stagedItems = Array.isArray(payload.stagedItems) ? payload.stagedItems : [];
    if (body.sourceFiles.length !== stagedItems.length) {
      return NextResponse.json({ error: "จำนวนไฟล์ต้นฉบับไม่ตรงกับรายการหลักฐาน" }, { status: 400 });
    }
    const caseNumber = typeof payload.caseNumber === "string" ? payload.caseNumber : "Evidence";
    const stem = safeFileStem(caseNumber);
    const rarExe = process.env.WINRAR_RAR_EXE || "C:\\Program Files\\WinRAR\\Rar.exe";
    await fs.access(rarExe);

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "digital-evidence-sfx-"));
    const packageDir = path.join(tempDir, "package");
    await fs.mkdir(packageDir);
    const inputPath = path.join(tempDir, "payload.json");
    const pdfPath = path.join(packageDir, "Digital_Evidence_Report.pdf");
    const outputPath = path.join(tempDir, `Digital_Evidence_${stem}.exe`);
    await fs.writeFile(inputPath, JSON.stringify({ ...payload, exportPasswordSet: Boolean(password) }), "utf8");
    await runPdfExporter(inputPath, pdfPath, password);
    await verifyPdfProtection(pdfPath, password);

    const logoPath = "D:\\Project\\Digital Evi - Codex\\digital-evidence\\src\\app\\LOGO.png";
    const iconPath = "D:\\Project\\Digital Evi - Codex\\digital-evidence\\src\\app\\icon.ico";
    await Promise.all([fs.access(logoPath), fs.access(iconPath)]);

    const readmePath = path.join(packageDir, "README.txt");
    await fs.writeFile(
      readmePath,
      [
        "DIGITAL EVIDENCE - แพ็กเกจส่งออก",
        `เลขอ้างอิง: ${caseNumber}`,
        "ไฟล์ภายใน: PDF ฉบับเต็ม, ไฟล์หลักฐานต้นฉบับ, manifest ตรวจสอบ SHA-256 และ README",
        password
          ? "ใช้รหัสส่งออกเดียวกันเพื่อแตกแพ็กเกจและเปิดรายงาน PDF"
          : "ไม่ได้ตั้งรหัสผ่านสำหรับแพ็กเกจหรือรายงาน PDF",
      ].join("\r\n"),
      "utf8",
    );

    const packagedFiles = [
      { fileName: "Digital_Evidence_Report.pdf", path: pdfPath },
      { fileName: "README.txt", path: readmePath },
    ];
    const usedNames = new Set(packagedFiles.map((file) => file.fileName.toLowerCase()));
    for (const [index, sourceFile] of body.sourceFiles.entries()) {
      const rawName = path.basename(sourceFile.name).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim().slice(0, 160) || `evidence-${index + 1}`;
      let fileName = `Evidence_${String(index + 1).padStart(3, "0")}_${rawName}`;
      let suffix = 2;
      while (usedNames.has(fileName.toLowerCase())) {
        const extension = path.extname(rawName);
        const base = rawName.slice(0, rawName.length - extension.length);
        fileName = `Evidence_${String(index + 1).padStart(3, "0")}_${base}_${suffix++}${extension}`;
      }
      usedNames.add(fileName.toLowerCase());
      const sourcePath = path.join(packageDir, fileName);
      await fs.writeFile(sourcePath, Buffer.from(await sourceFile.arrayBuffer()));
      packagedFiles.push({ fileName, path: sourcePath });
    }
    const packageManifest = {
      caseNumber,
      generatedAt: new Date().toISOString(),
      passwordProtected: Boolean(password),
      sourceManifestEntries: Array.isArray(payload.manifestEntries) ? payload.manifestEntries : [],
      packagedFiles: await Promise.all(packagedFiles.map(async (file) => ({
        fileName: file.fileName,
        sizeBytes: (await fs.stat(/*turbopackIgnore: true*/ file.path)).size,
        sha256: await sha256(file.path),
      }))),
    };
    const manifestPath = path.join(packageDir, "manifest.json");
    await fs.writeFile(manifestPath, JSON.stringify(packageManifest, null, 2), "utf8");
    packagedFiles.push({ fileName: "manifest.json", path: manifestPath });

    const sfxConfigPath = path.join(tempDir, "sfx_config.txt");
    const sfxComment = "Title=DIGITAL EVIDENCE\r\nText\r\n{\r\nDIGITAL EVIDENCE \r\nเป็นเพียงการเครื่องมืออำนวยความสะดวก ให้กับผู้ว่าจ้าง โดยไม่ได้ดัดแปลง แก้ไข เพิ่ม-ลด เนื้อหา จากต้นฉบับใดๆ และไม่มีส่วนเกี่ยวข้องใดๆ กับเนื้อหาในเอกสาร เป็นเพียงเครื่องมือที่ทำงานเกี่ยวกับระบบไฟล์เอกสารแบบอิเล็กทรอนิกส์เท่านั้น\r\n}\r\n";
    await fs.writeFile(sfxConfigPath, sfxComment, "utf8");
    const files = packagedFiles.map((file) => file.fileName);
    const archiveArgs = ["a", "-sfx", "-ep1", "-m0", "-idq", `-iicon${iconPath}`, `-iimg${logoPath}`, `-z${sfxConfigPath}`];
    if (password) archiveArgs.push(`-hp${password}`);
    archiveArgs.push(outputPath, ...files);
    await runCommand(rarExe, archiveArgs, { cwd: packageDir });

    const archive = await fs.readFile(outputPath);
    return new Response(new Uint8Array(archive), {
      headers: {
        "Content-Type": "application/vnd.microsoft.portable-executable",
        "Content-Disposition": `attachment; filename="Digital_Evidence_${stem}.exe"`,
        "Cache-Control": "no-store",
        "X-Digital-Evidence-Encrypted": password ? "true" : "false",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดระหว่างสร้าง SFX";
    return NextResponse.json({ error: message.slice(0, 500) }, { status: 500 });
  } finally {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
