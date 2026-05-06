import { Request, Response, NextFunction } from "express";
import { JwtPayload } from "jsonwebtoken";
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload | string;
        }
    }
}
declare const requireSignIn: (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
export default requireSignIn;
//# sourceMappingURL=requireSignIn.d.ts.map