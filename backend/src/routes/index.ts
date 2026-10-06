import express from 'express';
import filesRouter from './files';
import foldersRouter from './folders';
import itemsRouter from './items';
import searchRouter from './search';

// Everything under /api, so the server and the tests mount the same thing
const apiRouter = express.Router();

apiRouter.use('/files', filesRouter);
apiRouter.use('/folders', foldersRouter);
apiRouter.use('/items', itemsRouter);
apiRouter.use('/search', searchRouter);

export default apiRouter;
