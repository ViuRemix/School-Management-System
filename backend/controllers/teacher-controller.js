const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Teacher = require('../models/teacherSchema.js');
const Subject = require('../models/subjectSchema.js');
const Admin = require('../models/adminSchema.js'); // Thêm dòng này để đăng ký schema Admin

const teacherRegister = async (req, res) => {
    let { name, email, password, role, school, teachSubject, teachSclass, phoneNumber, gender, dob, address } = req.body;

    try {
        if (school && typeof school === 'object' && school._id) {
            school = school._id;
        }

        if (!school) {
            return res.status(400).json({ message: 'School ID is required' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPass = await bcrypt.hash(password, salt);

        const teacher = new Teacher({
            name,
            email,
            password: hashedPass,
            role,
            school: school,
            teachSubject,
            teachSclass,
            phoneNumber,
            gender,
            dob,
            address
        });

        const existingTeacherByEmail = await Teacher.findOne({ email });

        if (existingTeacherByEmail) {
            res.send({ message: 'Email already exists' });
        } else {
            let result = await teacher.save();
            await Subject.findByIdAndUpdate(teachSubject, { teacher: teacher._id });
            result.password = undefined;
            res.send(result);
        }
    } catch (err) {
        res.status(500).json(err);
    }
};


const teacherLogIn = async (req, res) => {
    try {
        let teacher = await Teacher.findOne({ email: req.body.email });
        if (teacher) {
            const validated = await bcrypt.compare(req.body.password, teacher.password);
            if (validated) {
                if (teacher.teachSubject) {
                    await teacher.populate("teachSubject", "subName sessions");
                }
                if (teacher.school) {
                    await teacher.populate("school", "_id schoolName");
                }
                if (teacher.teachSclass) {
                    await teacher.populate("teachSclass", "sclassName");
                }
                teacher.password = undefined;
                res.send(teacher);
            } else {
                res.send({ message: "Invalid password" });
            }
        } else {
            res.send({ message: "Teacher not found" });
        }
    } catch (err) {
        res.status(500).json(err);
    }
};
const getTeachers = async (req, res) => {
    const schoolId = req.params.id;
    try {
        if (!mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(400).json({ message: "Invalid school ID" });
        }
        // Sửa lại populate cho đúng tên trường (teachSubject, teachSclass)
        const teachers = await Teacher.find({ school: schoolId })
            .populate('teachSubject', 'subName sessions')
            .populate('teachSclass', 'sclassName');
        res.status(200).json(teachers);
    } catch (error) {
        console.error("Error fetching teachers by school:", error.message);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
};


const getTeacherDetail = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: "Invalid teacher ID" });
        }
        // Bỏ populate school nếu không thực sự cần, để tránh lỗi populate ref không đúng
        let teacher = await Teacher.findById(req.params.id)
            .populate({ path: "teachSubject", select: "subName sessions" })
            // .populate({ path: "school", select: "_id schoolName" }) // Bỏ dòng này nếu không cần
            .populate({ path: "teachSclass", select: "sclassName" });
        if (!teacher) {
            return res.status(404).json({ message: "No teacher found" });
        }
        teacher.password = undefined;
        res.send(teacher);
    } catch (err) {
        console.error("Error in getTeacherDetail:", err);
        res.status(500).json({ message: "Internal server error", error: err.message });
    }
};

const updateTeacherSubject = async (req, res) => {
    const { teacherId, teachSubject } = req.body;
    try {
        const updatedTeacher = await Teacher.findByIdAndUpdate(
            teacherId,
            { teachSubject },
            { new: true }
        );

        await Subject.findByIdAndUpdate(teachSubject, { teacher: updatedTeacher._id });

        res.send(updatedTeacher);
    } catch (error) {
        res.status(500).json(error);
    }
};

const deleteTeacher = async (req, res) => {
    try {
        const deletedTeacher = await Teacher.findByIdAndDelete(req.params.id);

        await Subject.updateOne(
            { teacher: deletedTeacher._id, teacher: { $exists: true } },
            { $unset: { teacher: 1 } }
        );

        res.send(deletedTeacher);
    } catch (error) {
        res.status(500).json(error);
    }
};

const deleteTeachers = async (req, res) => {
    try {
        const deletionResult = await Teacher.deleteMany({ school: req.params.id });

        const deletedCount = deletionResult.deletedCount || 0;

        if (deletedCount === 0) {
            res.send({ message: "No teachers found to delete" });
            return;
        }

        const deletedTeachers = await Teacher.find({ school: req.params.id });

        await Subject.updateMany(
            { teacher: { $in: deletedTeachers.map(teacher => teacher._id) }, teacher: { $exists: true } },
            { $unset: { teacher: "" }, $unset: { teacher: null } }
        );

        res.send(deletionResult);
    } catch (error) {
        res.status(500).json(error);
    }
};

const deleteTeachersByClass = async (req, res) => {
    try {
        const deletionResult = await Teacher.deleteMany({ sclassName: req.params.id });

        const deletedCount = deletionResult.deletedCount || 0;

        if (deletedCount === 0) {
            res.send({ message: "No teachers found to delete" });
            return;
        }

        const deletedTeachers = await Teacher.find({ sclassName: req.params.id });

        await Subject.updateMany(
            { teacher: { $in: deletedTeachers.map(teacher => teacher._id) }, teacher: { $exists: true } },
            { $unset: { teacher: "" }, $unset: { teacher: null } }
        );

        res.send(deletionResult);
    } catch (error) {
        res.status(500).json(error);
    }
};

const teacherAttendance = async (req, res) => {
    const { status, date } = req.body;

    try {
        const teacher = await Teacher.findById(req.params.id);

        if (!teacher) {
            return res.send({ message: 'Teacher not found' });
        }

        const existingAttendance = teacher.attendance.find(
            (a) =>
                a.date.toDateString() === new Date(date).toDateString()
        );

        if (existingAttendance) {
            existingAttendance.status = status;
        } else {
            teacher.attendance.push({ date, status });
        }

        const result = await teacher.save();
        return res.send(result);
    } catch (error) {
        res.status(500).json(error)
    }
};

// Endpoint tạm thời để fix dữ liệu teacher có school là object
const fixTeacherSchoolField = async (req, res) => {
    try {
        const teachers = await Teacher.find({ "school._id": { $exists: true } });
        let count = 0;
        for (const doc of teachers) {
            await Teacher.updateOne(
                { _id: doc._id },
                { $set: { school: doc.school._id } }
            );
            count++;
        }
        res.json({ message: `Đã sửa ${count} bản ghi teacher có school là object.` });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi khi fix dữ liệu teacher', error: err.message });
    }
};

module.exports = {
    teacherRegister,
    teacherLogIn,
    getTeachers,
    getTeacherDetail,
    updateTeacherSubject,
    deleteTeacher,
    deleteTeachers,
    deleteTeachersByClass,
    teacherAttendance,
    fixTeacherSchoolField
};