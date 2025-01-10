const express = require("express");
const { uploadFile, extractText, uploadFiles, uploadDriveLink } = require("../controllers/fileController");
const multer = require("multer");

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "server/uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

router.post("/upload", upload.array("files", 5), uploadFiles);
router.post("/upload-drive-link", uploadDriveLink);



module.exports = router;
