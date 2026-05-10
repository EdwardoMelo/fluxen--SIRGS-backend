import { Router } from 'express';
import { LandingContactController } from '../controllers/landingContactController';

const router = Router();
const controller = new LandingContactController();

router.post('/landing/contact', controller.submitContact.bind(controller));

export default router;
