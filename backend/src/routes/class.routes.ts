import { Router } from 'express';
import {
  listClasses, getClassById, createClass, updateClass, deleteClass,
  getClassSubjects, createSubject, updateSubject, deleteSubject,
  getClassStudents, enrollStudent, removeStudent,
  createClassValidators, createSubjectValidators, enrollStudentValidators,
} from '../controllers/class.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { requireAdmin, requireTeacher } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

// All class routes require authentication
router.use(authenticateToken);

// Class CRUD
router.get('/', listClasses);
router.post('/', requireAdmin, createClassValidators, validate, createClass);
router.get('/:id', getClassById);
router.put('/:id', requireAdmin, validate, updateClass);
router.delete('/:id', requireAdmin, deleteClass);

// Subjects
router.get('/:id/subjects', getClassSubjects);
router.post('/:id/subjects', requireAdmin, createSubjectValidators, validate, createSubject);
router.put('/:id/subjects/:subjectId', requireAdmin, validate, updateSubject);
router.delete('/:id/subjects/:subjectId', requireAdmin, deleteSubject);

// Student enrollment
router.get('/:id/students', requireTeacher, getClassStudents);
router.post('/:id/students', requireAdmin, enrollStudentValidators, validate, enrollStudent);
router.delete('/:id/students/:studentId', requireAdmin, removeStudent);

export default router;
