import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload | string;
        }
    }
}

const requireSignIn = (req: Request, res: Response, next: NextFunction) => {
    if (!req.cookies || !req.cookies.token) {
        return res.status(401).json({ message: "Unauthorized no cookies" });
    }
    const token = req.cookies.token;
    jwt.verify(
        token,
        process.env.JWT_SECRET as string,
        (
            err: jwt.VerifyErrors | null,
            decoded: JwtPayload | string | undefined,
        ) => {
            if (err) {
                return res.status(401).json({ message: "Unauthorized" });
            }
            req.user = decoded;
            next();
        },
    );
};

export default requireSignIn;
