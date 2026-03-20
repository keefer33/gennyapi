import express from 'express';
import { authenticateUser } from '../../middlewares/auth';
import { getToolkits } from './getToolkits';
import { getToolkitsCategories } from './getToolkitsCategories';
import { getToolkitsBySlug } from './getToolkitsBySlug';
import { getTools } from './getTools';
import { getToolByToolSlug } from './getToolsByToolSlug';
import { getAuthConfigs } from './getAuthConfigs';
import { listConnectedAccounts } from './listConnectedAccounts';
import { createConnectLink } from './createConnectLink';
import { deleteConnectedAccount } from './deleteConnectedAccount';

const router = express.Router();

router.get('/auth-configs', authenticateUser, getAuthConfigs);
router.get('/connected-accounts', authenticateUser, listConnectedAccounts);
router.post('/connected-accounts/link', authenticateUser, createConnectLink);
router.delete('/connected-accounts/:id', authenticateUser, deleteConnectedAccount);
router.get('/tools', authenticateUser, getTools);
router.get('/tools/:tool_slug', authenticateUser, getToolByToolSlug);
router.get('/toolkits', authenticateUser, getToolkits);
router.get('/toolkits/categories', authenticateUser, getToolkitsCategories);
router.get('/toolkits/:slug', authenticateUser, getToolkitsBySlug);

export default router;
