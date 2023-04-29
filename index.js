const express = require('express')
const path = require("path");
const bodyparser = require("body-parser")
const dotenv = require("dotenv")
const docusign = require("docusign-esign")
const fs = require("fs")
const session = require("express-session")

dotenv.config();


const app = express();
app.use(bodyparser.urlencoded({extended: true}))
app.use(session({
    secret: "gfgdhfdgfqwy1",
    resave: true,
    saveUninitialized: true,
}))


function getEnvelopeApi(req) {
    let dsApiClient = new docusign.ApiClient();
    dsApiClient.setBasePath(process.env.BASE_PATH);
    dsApiClient.addDefaultHeader('Authorization', 'Bearer ' + req.session.access_token);
	return new docusign.EnvelopesApi(dsApiClient)
}


function makeEnvelope(name , email , company){

    // Create the envelope definition
    let env = new docusign.EnvelopeDefinition();
    env.templateId = process.env.TEMPLATE_ID;

    let text = docusign.Text.constructFromObject({
        tabLabel: "company_name", value: company
    })

    let tabs = docusign.Tabs.constructFromObject({
        textLabel: [text],
    });

    // Create template role elements to connect the signer and cc recipients
    // to the template
    // We're setting the parameters via the object creation
    let signer1 = docusign.TemplateRole.constructFromObject({
        email: email,
        name: name,
        tabs: tabs,
        clientUserId: process.env.CLIENT_USER_ID,
        roleName: 'Applicant'});


    // Add the TemplateRole objects to the envelope object
    env.templateRoles = [signer1];
    env.status = "sent"; // We want the envelope to be sent

    return env;
}


function makeRecipientViewRequest(name , email) {
  
    let viewRequest = new docusign.RecipientViewRequest();

   
    viewRequest.returnUrl = "http://localhost:8000/success";
    viewRequest.authenticationMethod = 'none';
    

    viewRequest.email = email;
    viewRequest.userName = name;
    viewRequest.clientUserId = process.env.CLIENT_USER_ID;


    return viewRequest
}



async function checkToken(req){
    
    if(req.session.access_token && Date.now() < req.session.expires_at){
        console.log("re-using access_token" , req.session.access_token)
    }else{
        let dsApiClient = new docusign.ApiClient();
        dsApiClient.setBasePath(process.env.BASE_PATH);
        const results = await dsApiClient.requestJWTUserToken(process.env.INTEGRATION_KEY, process.env.USER_ID, "signature",
        fs.readFileSync(path.join(__dirname, "private.key")),
        3600
        );
        console.log(results.body)

        req.session.access_token = results.body.access_token;
        req.session.expires_at = Date.now() + (results.body.expires_in - 60)*1000;
        
    }
} 

app.get("/" , async(req,res) => {
    await checkToken(req);
    res.sendFile(path.join(__dirname, "main.html"));

    
})


//  https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=76893f10-2601-40f0-94b9-0a3536c0a862&redirect_uri=http://localhost:8000



app.post("/form" , async(req,res) => {

    await checkToken(req);
    let envelopesApi = getEnvelopeApi(req);
    let envelope = makeEnvelope(req.body.name , req.body.email)

    let results = await envelopesApi.createEnvelope(process.env.ACCOUNT_ID, {envelopeDefinition: envelope});
    console.log("envelope results" , results);

    // Create the recipient view, the Signing Ceremony
let viewRequest = makeRecipientViewRequest(req.body.name , req.body.email , req.body.company);
// Call the CreateRecipientView API
// Exceptions will be caught by the calling function
results = await envelopesApi.createRecipientView(process.env.ACCOUNT_ID, results.envelopeId,
    {recipientViewRequest: viewRequest});

   res.redirect(results.url);
})


app.get("/success" , (req,res) => {
    res.send("success")
})


app.listen(8000 , () => {
  console.log("Server has Started " , process.env.USER_ID)
})

