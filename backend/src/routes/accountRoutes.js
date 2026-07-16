const express = require("express");
const router = express.Router();

const accountController = require("../controllers/accountController");

router.post("/", accountController.createAccount);

router.get("/", accountController.getAccounts);

router.delete("/:id", accountController.deleteAccount);

// routes.js
router.post("/:id/refresh", accountController.refreshAccount); // Para una cuenta específica
router.post("/refresh-all", accountController.refreshAllAccounts); // Para todas las cuentas

module.exports = router;