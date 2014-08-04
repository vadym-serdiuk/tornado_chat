var ws = null;
var rooms = new Array();

$(document).ready(function(){

    connect_to_server();

    $('a.register_link').on('click', function(e){
        e.preventDefault();
        show_signup()
    });

    //Opens login dialog
    $('a.login_link').on('click', function(e){
        e.preventDefault();
        show_login()
    });

    //Initiates send login data
    $('#login_button').on('click', function(){
        data = {
            username: $('#login_username').val(),
            password: $('#login_password').val()
        };

        $('#login_username').val('');
        $('#login_password').val('');

        $.ajax({
            data: data,
            url: '/login',
            method: 'POST',
            dataType: 'json',
            success: function(data){
                if (data.status == 'success')
                    connect_to_server();
                else
                    show_error(data.message);
            },
            error: function(error){
                show_error(error);
            }
       });
    });

    //Initiates send registration data
    $('#signup_button').on('click', function(){
        username = $('#reg_username').val();
        password = $('#reg_password1').val();
        if (password != $('#reg_password2').val()){
            show_error('passwords do not match. Please check');
        }

        data = {
            username: username,
            password: password
        };

        $.ajax({
            data: data,
            url: '/signup',
            method: 'POST',
            dataType: 'json',
            success: function(data){
                if (data.status == 'success')
                    connect_to_server();
                else
                    show_error(data.message);
            },
            error: function(error){
                show_error(error);
            }
       });
    });

    $('.dropdown-menu').find('form').click(function (e) {
        e.stopPropagation();
    });

    $('form.create_room').on('submit', function(e){
        e.preventDefault();
        create_room();
    });

    $('#join_room').on('click', function(){
        join_room();
    });

    $('#leave_room').on('click', function(){
        leave_room();
    });

    $('#send').on('click', function(){
        text = $('#newmessage').val();
        if (text == '') return;
        data = {
            text: text
        };
        ws.send(JSON.stringify(data));
        if (ws.bufferedAmount == 0){
            $('#newmessage').val('')
        }else{
            show_error('Something wrong');
        }
    })
});

function show_login(){
    $('.window').hide();
    $('#login').fadeIn().removeClass('invisible');
}

function show_signup(){
    $('.window').hide();
    $('#register').fadeIn().removeClass('invisible');
}

function show_chat(){
    $('.window').hide();
    $('#chat').fadeIn().removeClass('invisible');
}

function reload_rooms(){
    ws.send('/rooms');
}

function onmessage(event){
    data = JSON.parse(event.data);
    if ('server_event' in data){
        if (data.server_event == 'room_created'){
            $('.btn-group').removeClass('open');
            reload_rooms();
            return;
        }
        if (data.server_event == 'room_joined'){
            show_room(data.room);
            return;
        }
        if (data.server_event == 'rooms_list'){
           rooms = data.list;
           rooms_ul = $('.rooms_list');
           rooms_ul.html('');

           for (i=0; i < rooms.length; i++){
               room = rooms[i];
               rooms_ul.append('<li class="room" data-room-name="'+room.name+'">'+room.name+'</li>');
               if (room.joined)
                    $('#'+room_id).addClass('joined');
           }
        }
        return;
    }

    if ('status' in data) {
        if (data.status == 'error'){
            show_error(data.message);
            return;
        }
        return;
    }

    if ('text' in data){
        data.time = new Date(data.time.$date);
        html = '<p class="message"><span class="username">' + data.username +
         '</span><span class="time">' + data.time.toTimeString().substring(0,8) +
         '</span><span class="text">' + data.text + '</span>';
        messages = $('.messages.'+data.room)[0];
        $('.messages').addClass('invisible')
        messages.removeClass('invisible');
        messages.append(html);
        messages.scrollTop(messages.scrollHeight);
    }
}

function onclose(event){
    show_error(event.reason || 'Unexpected error');
    ws = null;
    show_login();
}

function onopen(){
    reload_rooms();
    show_chat();
}

function check_room_name(room){
    return room.match(/^[a-zA-Z]+[\w\s]{0,30}$/) != null;
}

function connect_to_server(){
    url = location.hostname+(location.port ? ':'+location.port: '');
    ws = new WebSocket('ws://' + url + '/chat');
    ws.onclose = onclose;
    ws.onmessage = onmessage;
    ws.onopen = onopen;
}

function create_room(){
    room = $('#room_name').val();
    if (check_room_name(room))
        ws.send('/create ' + room);
    else
        show_error('Room name is wrong');
}

function join_room(){
    room = $('.rooms_list.active');
    if (room.hasClass('joined')) return;
    if ($('.messages.'+room).length == 0)
        $('.messages_wrapper').append('<div class="messages ' + room + '"></div>');
    command = '/join ' + room;
    ws.send(command);
}

function leave_room(){
    room = $('.room.active');
    if (room.hasClass('joined')) {
        command = '/leave ' + room.data('roomName');
        ws.send(command);
    }
}

function close_status_line(){
    $('#status_line').fadeOut();
}

function show_error(text){
    console.log(text);
    $('#status_line').html('<div class="error">' + text + '</div>').fadeIn();
    setTimeout(close_status_line, 5000);
}