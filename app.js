const express = require('express');
const app = express();
const objId = require('mongodb').ObjectId; // MongoDB ObjectId 사용을 위해 추가
const bcrypt = require('bcrypt'); // 비밀번호 암호화를 위해 bcrypt 모듈 추가
const session = require('express-session'); // 세션 관리를 위해 express-session 모듈 추가
const path = require('path'); // 경로 관리를 위해 path 모듈 추가
const multer = require('multer'); // 파일 업로드를 위해 multer 모듈 추가
const fs = require('fs'); // 파일 시스템 모듈 추가

const bodyParser = require('body-parser'); // POST 요청 데이터 처리를 위해 body-parser 모듈 추가
app.use(bodyParser.urlencoded({ extended: true })); // body-parser 미들웨어 설정

const mongoclient = require("mongodb").MongoClient;

const mongodb_url = 'mongodb+srv://leeyun:dldbstp1234@myboard.qepi3hp.mongodb.net/?retryWrites=true&w=majority&appName=myboard';
let mydb; // 데이터베이스 객체 변수 선언


// MongoDB 연결 설정
mongoclient.connect(mongodb_url)
    .then((client) => {
        mydb = client.db('myboard'); // 연결된 클라이언트 myboard데이터베이스 가져옴
    });

app.set('view engine', 'ejs');// 템플릿 엔진 EJS 설정

// 세션 미들웨어 설정
app.use(session({
    secret: 'mySecretKey', // 세션 암호화에 사용되는 비밀키
    resave: false, // 세션 데이터가 변경되지 않더라도 세션을 저장할지 여부
    saveUninitialized: false // 초기화되지 않은 세션을 저장할지 여부
}));

// views 디렉토리 설정 
app.set('views', path.join(__dirname, 'views'));

// uploads 폴더 생성
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir); // 디렉토리가 존재하지 않으면 생성
}

// 정적 파일 서빙 설정
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));// 업로드된 파일을 제공하는 정적 경로 설정

// multer storage 설정
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir); // 파일이 저장될 경로 설정
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname); // 파일 이름 설정
    }
});
const upload = multer({ storage: storage }); // multer 초기화

app.get('/', function (req, res) {
    // 로그인 여부에 따라 다르게 렌더링
    if (req.session.user) {
        // 세션에 로그인 정보가 있으면 메인 페이지로 이동
        res.redirect('/main');
    } else {
        // 세션에 로그인 정보가 없으면 로그인 페이지 렌더링
        res.render('login.ejs');
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    // 사용자 이름으로 MongoDB에서 사용자 정보를 찾음
    const user = await mydb.collection('users').findOne({ username: username });// 사용자 이름과 비밀번호를 추출
    
    if (user) {
        // 비밀번호가 일치하면 세션에 로그인 정보 저장 후 메인 페이지로 이동
        if (user.password === password) {
            req.session.user = user; // 세션에 로그인 정보 저장
            res.redirect('/main');
        } else {
            // 비밀번호가 일치하지 않으면 로그인 실패 메시지 출력
            res.send('비밀번호가 일치하지 않습니다.');
        }
    } else {
        // 해당 사용자 이름이 MongoDB에 없으면 로그인 실패 메시지 출력
        res.send('사용자를 찾을 수 없습니다.');
    }
});

app.get('/main', function (req, res) {
    // 세션에 로그인 정보가 없으면 로그인 페이지로 이동
    if (!req.session.user) {
        res.redirect('/');
    } else {
        // 세션에 저장된 사용자 정보를 데이터로 전달하여 렌더링
        mydb.collection('post').find().toArray().then(result => {
            res.render('listmongo.ejs', { user: req.session.user, data: result });
        }).catch(err => {
            console.log('Failed to fetch post data:', err);
            res.status(500).send('Failed to fetch post data');
        });
    }
});

// 로그아웃 처리
app.post('/logout', function (req, res) {
    req.session.destroy(); // 세션에서 로그인 정보 삭제
    res.redirect('/'); // 로그인 페이지로 이동
});

// 게시글 작성 페이지 렌더링
app.get('/createPost', function (req, res) {
    res.render('createPost.ejs'); // createPost.ejs 뷰를 렌더링
});

// 게시글 작성 요청 처리
app.post('/createPost', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'document', maxCount: 1 }]), async (req, res) => {
    const { title, caption } = req.body; // 요청 본문에서 제목과 설명을 추출
    const image = req.files['image'] ? req.files['image'][0] : null; // 업로드된 이미지 파일이 있는지 확인하고 첫 번째 파일을 추출
    const document = req.files['document'] ? req.files['document'][0] : null; // 업로드된 문서 파일이 있는지 확인하고 첫 번째 파일을 추출

    try {
        let imageData = {}; // 이미지 데이터를 저장할 객체 생성
        let documentData = {}; // 문서 데이터를 저장할 객체 생성

        if (image) {
            imageData = { image: '/uploads/' + image.filename }; // 이미지 데이터 객체에 이미지 경로 저장
        }

        if (document) {
            const filePath = path.join(__dirname, 'uploads', document.filename); // 업로드된 문서 파일의 경로 설정
            const documentContent = fs.readFileSync(filePath, 'utf8'); // 파일을 읽어서 내용을 변수에 저장
            documentData = { document: '/uploads/' + document.filename, content: documentContent }; // 문서 데이터 객체에 문서 경로와 내용을 저장
        }

        // MongoDB에 게시글 정보 저장
        await mydb.collection('post').insertOne({
            title: title, // 게시글 제목
            caption: caption, // 게시글 설명
            ...imageData, // 이미지 데이터 객체 병합
            ...documentData // 문서 데이터 객체 병합
        });

        res.redirect('/main'); // 게시물이 성공적으로 작성되면 메인 페이지로 이동
    } catch (err) {
        console.log('Failed to create post:', err); // 게시물 작성 실패 시 에러 로그 출력
        res.status(500).send('게시물 작성에 실패했습니다.'); // 클라이언트에게 오류 메시지 전송
    }
});

//몽고db 삭제기능 
app.post('/deletemongo', async (req, res) => {
    const postId = req.body._id;
    try {
        // MongoDB에서 해당 ID의 게시물 삭제
        await mydb.collection('post').deleteOne({ _id: new objId(postId) }); // ObjectId 생성자 호출 수정
        res.status(200).send('게시물이 성공적으로 삭제되었습니다.');
    } catch (err) {
        console.log('Failed to delete post:', err);
        res.status(500).send('게시물 삭제에 실패했습니다.');
    }
});

// 이미지 업로드 엔드포인트
app.post('/upload', upload.single('image'), function(req, res) {
    if (!req.file) {
        return res.status(400).send('이미지를 업로드하지 못했습니다.');
    }
    res.status(200).send('이미지가 성공적으로 업로드되었습니다.');
});
// 서버 측의 코드 수정
app.post('/update', upload.single('image'), async (req, res) => {
    const postId = req.body._id; // 요청 본문에서 게시물 ID를 추출
    const newTitle = req.body.title; // 요청 본문에서 새로운 제목을 추출
    const newCaption = req.body.caption; // 요청 본문에서 새로운 설명을 추출
    const newImage = req.file; // 업로드된 새로운 이미지 파일 추출
    
    try {
        let updateData = {
            title: newTitle,
            caption: newCaption
        };

        // 새로운 이미지가 전송된 경우에만 이미지 데이터 저장
        if (newImage) {
            updateData.image = '/uploads/' + newImage.filename;
        }

        // MongoDB에서 해당 ID의 게시물을 찾아 제목, 내용, 이미지를 업데이트
        await mydb.collection('post').updateOne(
            { _id: new objId(postId) },
            { $set: updateData }
        );
        res.redirect('/main');
    } catch (err) {
        console.log('Failed to update post:', err);
        res.status(500).send('게시물 수정에 실패했습니다.');
    }
});

app.get('/signup', (req, res) => {
    res.render('register');
});

app.post('/signup', (req, res) => {
    const { username, password } = req.body;

    // MongoDB에 새로운 사용자 추가
    mydb.collection('users').insertOne({ username, password })
    .then(result => {
        console.log('회원가입 성공');
        res.status(200).send('회원가입 성공!');
    })
    .catch(err => {
        console.error('회원가입 실패:', err);
        res.status(500).send('회원가입 실패!');
    });
});
app.get('/sujung', function (req, res) {
    const { postId, title, caption, image } = req.query;

    // 수신한 데이터를 로그로 출력
    console.log(`Received data - Post ID: ${postId}, Title: ${title}, Caption: ${caption}, Image: ${image}`);

    // EJS 템플릿에 데이터 전달
    res.render('sujung', { postId, title, caption, image });
});



app.listen(8080, function () {
    console.log('포트 8080으로 서버 대기');
});
