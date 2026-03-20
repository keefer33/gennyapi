import express from 'express';
import { authenticateUser } from '../../middlewares/auth';
import { listServers } from './listServers';
import { getServer } from './getServer';
import { createConnection } from './createConnection';
import { listConnections } from './listConnections';
import { deleteConnection } from './deleteConnection';
import { getConnectionByServer } from './getConnectionByServer';

const router = express.Router();

// GET /mcpservers/list — list MCP servers from Smithery registry
router.get('/list', listServers);
// GET /mcpservers/list/:qualifiedName — get a single server by qualified name
router.get('/list/:qualifiedName', getServer);
// GET /mcpservers/connections — list MCP connections (Smithery Connect)
router.get('/connections', authenticateUser, listConnections);
// GET /mcpservers/connections/check?qualifiedName=... — connection for server by qualifiedName
router.get('/connections/check', authenticateUser, getConnectionByServer);
// DELETE /mcpservers/connections/:connectionId — delete MCP connection
router.delete('/connections/:connectionId', authenticateUser, deleteConnection);
// POST /mcpservers/connect — create MCP connection (Smithery Connect)
router.post('/connect', authenticateUser, createConnection);

export default router;
