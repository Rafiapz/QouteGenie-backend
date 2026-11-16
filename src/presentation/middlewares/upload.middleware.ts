import multer from "multer";
import path from "path";
import fs from "fs";
import { ValidationError } from "../../domain/errors/domain.error";

const UPLOAD_DIR = path.resolve(__dirname, "../../../uploads");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const sanitizedExt = path.extname(file.originalname).toLowerCase() || ".pdf";
    cb(null, `quote-${uniqueSuffix}${sanitizedExt}`);
  },
});

const fileFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const isPdfMime =
    file.mimetype === "application/pdf" ||
    file.mimetype === "application/x-pdf" ||
    file.mimetype === "application/octet-stream";

  if (ext === ".pdf" || isPdfMime) {
    cb(null, true);
  } else {
    cb(new ValidationError("Only PDF files are supported for quotation extraction."));
  }
};

export const uploadQuotePdf = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB max
  },
});
