"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeStudent = exports.enrollStudent = exports.getClassStudents = exports.deleteSubject = exports.updateSubject = exports.createSubject = exports.getClassSubjects = exports.deleteClass = exports.updateClass = exports.createClass = exports.getClassById = exports.listClasses = exports.enrollStudentValidators = exports.createSubjectValidators = exports.createClassValidators = void 0;
const express_validator_1 = require("express-validator");
const database_1 = require("../config/database");
const response_1 = require("../utils/response");
const error_middleware_1 = require("../middleware/error.middleware");
const logger_1 = __importDefault(require("../utils/logger"));
exports.createClassValidators = [
    (0, express_validator_1.body)('name').trim().notEmpty().isLength({ min: 2, max: 255 }).withMessage('Class name required'),
    (0, express_validator_1.body)('department').trim().notEmpty().withMessage('Department is required'),
    (0, express_validator_1.body)('semester').optional().isString(),
    (0, express_validator_1.body)('academic_year').optional().isString().isLength({ max: 20 }),
];
exports.createSubjectValidators = [
    (0, express_validator_1.body)('name').trim().notEmpty().isLength({ min: 2, max: 255 }).withMessage('Subject name required'),
    (0, express_validator_1.body)('code').trim().notEmpty().isLength({ min: 1, max: 50 }).withMessage('Subject code required'),
    (0, express_validator_1.body)('teacherId').optional().isUUID().withMessage('Invalid teacher ID'),
];
exports.enrollStudentValidators = [
    (0, express_validator_1.body)('studentId').notEmpty().isUUID().withMessage('Valid student ID is required'),
];
const listClasses = async (req, res, next) => {
    try {
        const { page, limit, offset } = (0, response_1.getPaginationParams)(req.query);
        const { department, academicYear, search } = req.query;
        const conditions = [];
        const params = [];
        let paramIndex = 1;
        if (department) {
            conditions.push(`c.department ILIKE $${paramIndex++}`);
            params.push(`%${department}%`);
        }
        if (academicYear) {
            conditions.push(`c.academic_year = $${paramIndex++}`);
            params.push(academicYear);
        }
        if (search) {
            conditions.push(`(c.name ILIKE $${paramIndex} OR c.department ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const [classesResult, countResult] = await Promise.all([
            (0, database_1.query)(`SELECT c.*,
                (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = c.id) as student_count,
                (SELECT COUNT(*) FROM subjects s WHERE s.class_id = c.id) as subject_count
         FROM classes c
         ${whereClause}
         ORDER BY c.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`, [...params, limit, offset]),
            (0, database_1.query)(`SELECT COUNT(*) as count FROM classes c ${whereClause}`, params),
        ]);
        const total = parseInt(countResult.rows[0]?.count || '0', 10);
        (0, response_1.paginatedResponse)(res, classesResult.rows, total, page, limit);
    }
    catch (error) {
        next(error);
    }
};
exports.listClasses = listClasses;
const getClassById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await (0, database_1.query)(`SELECT c.*,
              u.name as admin_name,
              (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = c.id) as student_count,
              (SELECT COUNT(*) FROM subjects s WHERE s.class_id = c.id) as subject_count
       FROM classes c
       LEFT JOIN users u ON u.id = c.admin_id
       WHERE c.id = $1`, [id]);
        if (result.rows.length === 0) {
            throw new error_middleware_1.NotFoundError('Class');
        }
        const subjectsResult = await (0, database_1.query)(`SELECT s.*, u.name as teacher_name
       FROM subjects s
       LEFT JOIN users u ON u.id = s.teacher_id
       WHERE s.class_id = $1
       ORDER BY s.name`, [id]);
        (0, response_1.successResponse)(res, {
            ...result.rows[0],
            subjects: subjectsResult.rows,
        }, 'Class retrieved');
    }
    catch (error) {
        next(error);
    }
};
exports.getClassById = getClassById;
const createClass = async (req, res, next) => {
    try {
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        const { name, department, semester, academic_year } = req.body;
        const result = await (0, database_1.query)(`INSERT INTO classes (name, department, semester, academic_year, admin_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`, [name, department, semester, academic_year, req.user.userId]);
        const newClass = result.rows[0];
        if (!newClass)
            throw new error_middleware_1.CustomError('Failed to create class', 500);
        logger_1.default.info('Class created', { classId: newClass.id, name, createdBy: req.user.userId });
        (0, response_1.createdResponse)(res, newClass, 'Class created successfully');
    }
    catch (error) {
        next(error);
    }
};
exports.createClass = createClass;
const updateClass = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, department, semester, academic_year } = req.body;
        const setClauses = [];
        const params = [];
        let paramIndex = 1;
        if (name) {
            setClauses.push(`name = $${paramIndex++}`);
            params.push(name);
        }
        if (department) {
            setClauses.push(`department = $${paramIndex++}`);
            params.push(department);
        }
        if (semester !== undefined) {
            setClauses.push(`semester = $${paramIndex++}`);
            params.push(semester);
        }
        if (academic_year !== undefined) {
            setClauses.push(`academic_year = $${paramIndex++}`);
            params.push(academic_year);
        }
        if (setClauses.length === 0) {
            (0, response_1.successResponse)(res, null, 'No changes provided');
            return;
        }
        params.push(id);
        const result = await (0, database_1.query)(`UPDATE classes SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`, params);
        if (result.rows.length === 0)
            throw new error_middleware_1.NotFoundError('Class');
        (0, response_1.successResponse)(res, result.rows[0], 'Class updated');
    }
    catch (error) {
        next(error);
    }
};
exports.updateClass = updateClass;
const deleteClass = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await (0, database_1.query)('DELETE FROM classes WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0)
            throw new error_middleware_1.NotFoundError('Class');
        (0, response_1.noContentResponse)(res);
    }
    catch (error) {
        next(error);
    }
};
exports.deleteClass = deleteClass;
const getClassSubjects = async (req, res, next) => {
    try {
        const { id: classId } = req.params;
        const result = await (0, database_1.query)(`SELECT s.*, u.name as teacher_name
       FROM subjects s
       LEFT JOIN users u ON u.id = s.teacher_id
       WHERE s.class_id = $1
       ORDER BY s.name`, [classId]);
        (0, response_1.successResponse)(res, result.rows, 'Subjects retrieved');
    }
    catch (error) {
        next(error);
    }
};
exports.getClassSubjects = getClassSubjects;
const createSubject = async (req, res, next) => {
    try {
        const { id: classId } = req.params;
        const { name, code, teacherId } = req.body;
        const classCheck = await (0, database_1.query)('SELECT id FROM classes WHERE id = $1', [classId]);
        if (classCheck.rows.length === 0)
            throw new error_middleware_1.NotFoundError('Class');
        const result = await (0, database_1.query)(`INSERT INTO subjects (name, code, class_id, teacher_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`, [name, code.toUpperCase(), classId, teacherId || null]);
        const subject = result.rows[0];
        if (!subject)
            throw new error_middleware_1.CustomError('Failed to create subject', 500);
        (0, response_1.createdResponse)(res, subject, 'Subject created');
    }
    catch (error) {
        next(error);
    }
};
exports.createSubject = createSubject;
const updateSubject = async (req, res, next) => {
    try {
        const { subjectId } = req.params;
        const { name, code, teacherId } = req.body;
        const setClauses = [];
        const params = [];
        let paramIndex = 1;
        if (name) {
            setClauses.push(`name = $${paramIndex++}`);
            params.push(name);
        }
        if (code) {
            setClauses.push(`code = $${paramIndex++}`);
            params.push(code.toUpperCase());
        }
        if (teacherId !== undefined) {
            setClauses.push(`teacher_id = $${paramIndex++}`);
            params.push(teacherId || null);
        }
        if (setClauses.length === 0) {
            (0, response_1.successResponse)(res, null, 'No changes');
            return;
        }
        params.push(subjectId);
        const result = await (0, database_1.query)(`UPDATE subjects SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`, params);
        if (result.rows.length === 0)
            throw new error_middleware_1.NotFoundError('Subject');
        (0, response_1.successResponse)(res, result.rows[0], 'Subject updated');
    }
    catch (error) {
        next(error);
    }
};
exports.updateSubject = updateSubject;
const deleteSubject = async (req, res, next) => {
    try {
        const { subjectId } = req.params;
        const result = await (0, database_1.query)('DELETE FROM subjects WHERE id = $1 RETURNING id', [subjectId]);
        if (result.rowCount === 0)
            throw new error_middleware_1.NotFoundError('Subject');
        (0, response_1.noContentResponse)(res);
    }
    catch (error) {
        next(error);
    }
};
exports.deleteSubject = deleteSubject;
const getClassStudents = async (req, res, next) => {
    try {
        const { id: classId } = req.params;
        const { page, limit, offset } = (0, response_1.getPaginationParams)(req.query);
        const [studentsResult, countResult] = await Promise.all([
            (0, database_1.query)(`SELECT u.id, u.name, u.email, u.phone, u.photo_url, u.is_active,
                ce.enrolled_at,
                EXISTS(
                  SELECT 1 FROM face_embeddings fe
                  WHERE fe.user_id = u.id AND fe.is_active = true
                ) as has_face_registered
         FROM class_enrollments ce
         JOIN users u ON u.id = ce.student_id
         WHERE ce.class_id = $1
         ORDER BY u.name
         LIMIT $2 OFFSET $3`, [classId, limit, offset]),
            (0, database_1.query)('SELECT COUNT(*) as count FROM class_enrollments WHERE class_id = $1', [classId]),
        ]);
        const total = parseInt(countResult.rows[0]?.count || '0', 10);
        (0, response_1.paginatedResponse)(res, studentsResult.rows, total, page, limit);
    }
    catch (error) {
        next(error);
    }
};
exports.getClassStudents = getClassStudents;
const enrollStudent = async (req, res, next) => {
    try {
        const { id: classId } = req.params;
        const { studentId } = req.body;
        const studentCheck = await (0, database_1.query)("SELECT id, role FROM users WHERE id = $1 AND is_active = true", [studentId]);
        if (studentCheck.rows.length === 0)
            throw new error_middleware_1.NotFoundError('Student');
        if (studentCheck.rows[0].role !== 'student') {
            throw new error_middleware_1.CustomError('User is not a student', 400);
        }
        const classCheck = await (0, database_1.query)('SELECT id FROM classes WHERE id = $1', [classId]);
        if (classCheck.rows.length === 0)
            throw new error_middleware_1.NotFoundError('Class');
        const result = await (0, database_1.query)(`INSERT INTO class_enrollments (student_id, class_id)
       VALUES ($1, $2)
       ON CONFLICT (student_id, class_id) DO NOTHING
       RETURNING *`, [studentId, classId]);
        if (result.rowCount === 0) {
            throw new error_middleware_1.ConflictError('Student is already enrolled in this class');
        }
        logger_1.default.info('Student enrolled', { studentId, classId });
        (0, response_1.createdResponse)(res, result.rows[0], 'Student enrolled successfully');
    }
    catch (error) {
        next(error);
    }
};
exports.enrollStudent = enrollStudent;
const removeStudent = async (req, res, next) => {
    try {
        const { id: classId, studentId } = req.params;
        const result = await (0, database_1.query)('DELETE FROM class_enrollments WHERE class_id = $1 AND student_id = $2 RETURNING id', [classId, studentId]);
        if (result.rowCount === 0) {
            throw new error_middleware_1.NotFoundError('Enrollment');
        }
        logger_1.default.info('Student removed from class', { studentId, classId });
        (0, response_1.noContentResponse)(res);
    }
    catch (error) {
        next(error);
    }
};
exports.removeStudent = removeStudent;
//# sourceMappingURL=class.controller.js.map